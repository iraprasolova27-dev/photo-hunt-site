const express = require('express');
const pg = require('pg');
const hbs = require('hbs');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const app = express();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

const pool = new pg.Pool(
    process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL
        }
        : {
            user: 'postgres',
            host: 'localhost',
            password: '88215',
            database: 'photo_hunt',
            port: 5432
        }
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'photo-hunt-secret',
    resave: false,
    saveUninitialized: false
}));

app.engine('hbs', expressHandlebars.engine({
    extname: 'hbs',
    defaultLayout: 'main'
}));

app.set('view engine', 'hbs');
app.set('views', './views');

app.use(express.static('public'));


/* Главная */

app.get('/', async (req, res) => {
    try {
const photosResult = await pool.query(
    `SELECT id, name, description, image_path
     FROM photos
     WHERE id IN (1, 2, 3, 4, 5)
     ORDER BY id`
);
        const lessonsResult = await pool.query(
    `SELECT id, name, description, link,
            CASE id
                WHEN 1 THEN 'uploads/04.jpg'
                WHEN 2 THEN 'uploads/05.jpg'
                WHEN 3 THEN 'uploads/06.jpg'
                WHEN 4 THEN 'uploads/07.jpg'
            END AS image_path
     FROM lessons
     WHERE id IN (1, 2, 3, 4)
     ORDER BY id`
);
        res.render('index', {
            title: 'Photo Hunt',
            isUser: !!req.session.userId,
            photos: photosResult.rows,
            lessons: lessonsResult.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка загрузки главной страницы');
    }
});


/* Вход */

app.get('/auth', (req, res) => {
    res.render('auth', {
        title: 'Вход',
        isUser: false
    });
});


app.post('/auth', async (req, res) => {
    const { login, password } = req.body;

    try {
        const result = await pool.query(
            `SELECT u.id, u.firstname, u.lastname
             FROM "user" u
             JOIN "authorization" a
             ON u.authorization_id = a.id
             WHERE a.login = $1
             AND a.password = $2
             AND u.blocked = false`,
            [login, password]
        );

        if (result.rows.length === 0) {
            return res.render('auth', {
                title: 'Вход',
                isUser: false,
                message: 'Неверный логин или пароль'
            });
        }

        req.session.userId = result.rows[0].id;
        req.session.userName = result.rows[0].firstname;

        res.redirect('/cabinet');

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка сервера');
    }
});


/* Регистрация */

app.get('/register', (req, res) => {
    res.render('register', {
        title: 'Регистрация',
        isUser: false
    });
});


app.post('/register', async (req, res) => {
    const {
        login,
        password,
        email,
        firstname,
        lastname
    } = req.body;

    try {
        const authResult = await pool.query(
            `INSERT INTO "authorization" (login, password)
             VALUES ($1, $2)
             RETURNING id`,
            [login, password]
        );

        const authorizationId = authResult.rows[0].id;

        const userResult = await pool.query(
            `INSERT INTO "user"
             (lastname, firstname, middlename, dataofbirth, phone, email,
              position_id, authorization_id, blocked, avatar, registration_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE)
             RETURNING id`,
            [
                lastname,
                firstname,
                '',
                '2000-01-01',
                '',
                email,
                1,
                authorizationId,
                false,
                null
            ]
        );

        req.session.userId = userResult.rows[0].id;
        req.session.userName = firstname;

        res.redirect('/cabinet');

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка регистрации');
    }
});


/* Выход */

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});


/* Личный кабинет */

app.get('/cabinet', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    try {
        const userResult = await pool.query(
    `SELECT
        id,
        firstname,
        lastname,
        middlename,
        phone,
        email,
        to_char(dataofbirth, 'DD.MM.YYYY') AS dataofbirth,
        avatar
     FROM "user"
     WHERE id = $1`,
    [req.session.userId]
);

        const requestResult = await pool.query(
            `SELECT
                pr.id,
                p.name AS photo_name,
                pr.request_date,
                s.name AS status_name
             FROM publish_requests pr
             JOIN photos p ON pr.photo_id = p.id
             JOIN statuses s ON pr.status_id = s.id
             WHERE pr.user_id = $1
             ORDER BY pr.id`,
            [req.session.userId]
        );

        res.render('home', {
            title: 'Личный кабинет',
            isUser: true,
            user: userResult.rows[0],
            requests: requestResult.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка загрузки личного кабинета');
    }
});


/* Редактирование профиля */

app.get('/cabinet/edit', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    try {
        const result = await pool.query(
            `SELECT firstname, lastname, email
             FROM "user"
             WHERE id = $1`,
            [req.session.userId]
        );

        res.render('edit-profile', {
            title: 'Редактирование профиля',
            isUser: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка сервера');
    }
});
app.get('/photos/add', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    try {
        const categoriesResult = await pool.query(
            `SELECT id, name
             FROM photo_categories
             ORDER BY id`
        );

        const paymentMethodsResult = await pool.query(
            `SELECT id, name
             FROM payment_methods
             ORDER BY id`
        );

        res.render('application', {
            title: 'Добавить фотографию',
            categories: categoriesResult.rows,
            paymentMethods: paymentMethodsResult.rows,
            isUser: true
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка загрузки страницы');
    }
});

app.post('/cabinet/edit', async (req, res) => {
    const {
        firstname,
        lastname,
        middlename,
        phone,
        dataofbirth,
        email
    } = req.body;

    try {
        await pool.query(
            `UPDATE "user"
             SET firstname = $1,
                 lastname = $2,
                 middlename = $3,
                 phone = $4,
                 dataofbirth = $5,
                 email = $6
             WHERE id = $7`,
            [
                firstname,
                lastname,
                middlename,
                phone,
                dataofbirth,
                email,
                req.session.userId
            ]
        );

        res.redirect('/cabinet');

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка сервера');
    }
});


/* Академия */

app.get('/lessons', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, description, link
             FROM lessons
             ORDER BY id`
        );

        res.render('lessons', {
            title: 'Академия',
            isUser: !!req.session.userId,
            lessons: result.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка загрузки уроков');
    }
});


/* Фотография */

app.get('/photo/:id', async (req, res) => {
    try {
        const photoResult = await pool.query(
            `SELECT
                p.id,
                p.name,
                p.description,
                p.image_path,
                pc.name AS category_name,
                u.firstname,
                u.lastname
             FROM photos p
             JOIN photo_categories pc
             ON p.category_id = pc.id
             JOIN "user" u
             ON p.user_id = u.id
             WHERE p.id = $1`,
            [req.params.id]
        );

        if (photoResult.rows.length === 0) {
            return res.status(404).send('Фотография не найдена');
        }

        const commentsResult = await pool.query(
            `SELECT
                c.text,
                c.created_at,
                u.firstname,
                u.lastname
             FROM comments c
             JOIN "user" u
             ON c.user_id = u.id
             WHERE c.material = $1
             ORDER BY c.id`,
            [photoResult.rows[0].name]
        );

        res.render('photo', {
            title: photoResult.rows[0].name,
            isUser: !!req.session.userId,
            photo: photoResult.rows[0],
            comments: commentsResult.rows
        });


    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка загрузки фотографии');
    }
});
app.post('/photo/:id/comment', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    const { text } = req.body;
    const photoId = req.params.id;

    try {
        const photoResult = await pool.query(
            `SELECT name
             FROM photos
             WHERE id = $1`,
            [photoId]
        );

        if (photoResult.rows.length === 0) {
            return res.status(404).send('Фотография не найдена');
        }

        await pool.query(
            `INSERT INTO comments
             (user_id, material, text, created_at, status)
             VALUES ($1, $2, $3, CURRENT_DATE, $4)`,
            [
                req.session.userId,
                photoResult.rows[0].name,
                text,
                'Опубликован'
            ]
        );

        res.redirect(`/photo/${photoId}`);

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка добавления комментария');
    }
});


/* Форум */

app.get('/forum', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                ft.id,
                ft.name,
                ft.views,
                ft.created_at,
                ft.status,
                ft.user_id,
                u.firstname,
                u.lastname,
                ft.user_id,
                fc.name AS category_name
             FROM forum_topics ft
             JOIN "user" u
             ON ft.user_id = u.id
             JOIN forum_categories fc
             ON ft.category_id = fc.id
             ORDER BY ft.id DESC`
        );

        const topics = result.rows.map(topic => ({
    ...topic,
    isAuthor: Number(topic.user_id) === Number(req.session.userId)
}));

app.post('/forum/topic/:id/delete', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    const topicId = req.params.id;

    try {
        const topicResult = await pool.query(
            `SELECT user_id
             FROM forum_topics
             WHERE id = $1`,
            [topicId]
        );

        if (topicResult.rows.length === 0) {
            return res.status(404).send('Тема не найдена');
        }

        if (Number(topicResult.rows[0].user_id) !== Number(req.session.userId)) {
            return res.status(403).send('Вы можете удалить только свою тему');
        }

        await pool.query(
            `DELETE FROM forum_messages
             WHERE topic_id = $1`,
            [topicId]
        );

        await pool.query(
            `DELETE FROM forum_topics
             WHERE id = $1`,
            [topicId]
        );

        res.redirect('/forum');

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка удаления темы');
    }
});

res.render('forum', {
    title: 'Форум',
    isUser: !!req.session.userId,
    topics: topics
});

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка загрузки форума');
    }
});
app.post('/forum/topic/:id/delete', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    const topicId = req.params.id;

    try {
        const topicResult = await pool.query(
            `SELECT user_id
             FROM forum_topics
             WHERE id = $1`,
            [topicId]
        );

        if (topicResult.rows.length === 0) {
            return res.status(404).send('Тема не найдена');
        }

        if (topicResult.rows[0].user_id !== req.session.userId) {
            return res.status(403).send('Вы можете удалить только свою тему');
        }

        await pool.query(
            `DELETE FROM forum_messages
             WHERE topic_id = $1`,
            [topicId]
        );

        await pool.query(
            `DELETE FROM forum_topics
             WHERE id = $1`,
            [topicId]
        );

        res.redirect('/forum');

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка удаления темы');
    }
});

/* Создание темы */

app.get('/forum/create', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    try {
        const categoriesResult = await pool.query(
            `SELECT id, name
             FROM forum_categories
             ORDER BY id`
        );

        const photosResult = await pool.query(
            `SELECT id, name
             FROM photos
             WHERE user_id = $1
             ORDER BY id`,
            [req.session.userId]
        );

        res.render('forum-create', {
            title: 'Создать тему',
            isUser: true,
            categories: categoriesResult.rows,
            photos: photosResult.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка сервера');
    }
});


app.post('/forum/create', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    const { name, category_id, text, photo_id } = req.body;

    try {
        const topicResult = await pool.query(
            `INSERT INTO forum_topics
             (name, category_id, created_at, user_id, views, status, photo_id)
             VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6)
             RETURNING id`,
            [
                name,
                category_id,
                req.session.userId,
                0,
                'Открыта',
                photo_id || null
            ]
        );

        const topicId = topicResult.rows[0].id;

        await pool.query(
            `INSERT INTO forum_messages
             (text, created_at, updated_at, topic_id, user_id)
             VALUES ($1, CURRENT_DATE, NULL, $2, $3)`,
            [
                text,
                topicId,
                req.session.userId
            ]
        );

        res.redirect(`/forum/topic/${topicId}`);

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка создания темы');
    }
});


/* Просмотр темы */

app.get('/forum/topic/:id', async (req, res) => {
    try {
        const topicId = req.params.id;

        await pool.query(
            `UPDATE forum_topics
             SET views = views + 1
             WHERE id = $1`,
            [topicId]
        );

        const topicResult = await pool.query(
            `SELECT
                ft.id,
                ft.name,
                ft.created_at,
                ft.views,
                ft.status,
                u.firstname,
                u.lastname,
                fc.name AS category_name,
                p.name AS photo_name,
                p.image_path AS photo_image_path
             FROM forum_topics ft
             JOIN "user" u
             ON ft.user_id = u.id
             JOIN forum_categories fc
             ON ft.category_id = fc.id
             LEFT JOIN photos p
             ON ft.photo_id = p.id
             WHERE ft.id = $1`,
            [topicId]
        );

        if (topicResult.rows.length === 0) {
            return res.status(404).send('Тема не найдена');
        }

        const messagesResult = await pool.query(
            `SELECT
                fm.id,
                fm.text,
                fm.created_at,
                fm.updated_at,
                u.firstname,
                u.lastname
             FROM forum_messages fm
             JOIN "user" u
             ON fm.user_id = u.id
             WHERE fm.topic_id = $1
             ORDER BY fm.id`,
            [topicId]
        );

        res.render('forum-topic', {
            title: topicResult.rows[0].name,
            isUser: !!req.session.userId,
            topic: topicResult.rows[0],
            messages: messagesResult.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка сервера');
    }
});

/* Ответ в теме */

app.post('/forum/topic/:id/reply', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    const { text } = req.body;
    const topicId = req.params.id;

    try {
        await pool.query(
            `INSERT INTO forum_messages
             (text, created_at, updated_at, topic_id, user_id)
             VALUES ($1, CURRENT_DATE, NULL, $2, $3)`,
            [
                text,
                topicId,
                req.session.userId
            ]
        );

        res.redirect(`/forum/topic/${topicId}`);

    } catch (error) {
        console.error(error);
        res.status(500).send('Ошибка добавления сообщения');
    }
});

app.post('/photos/add', upload.single('photo'), async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }

    const {
        name,
        description,
        category_id,
        payment_method_id
    } = req.body;

    if (!req.file) {
        return res.send('Выберите фотографию');
    }

    try {
        const photoResult = await pool.query(
            `INSERT INTO photos
             (photo_code, name, description, image_path, category_id, user_id, date_added)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
             RETURNING id`,
            [
                'PH' + Date.now(),
                name,
                description,
                'uploads/' + req.file.filename,
                category_id,
                req.session.userId
            ]
        );

        const photoId = photoResult.rows[0].id;

        await pool.query(
            `INSERT INTO publish_requests
             (request_date, user_id, status_id, photo_id, payment_method_id)
             VALUES (CURRENT_DATE, $1, $2, $3, $4)`,
            [
                req.session.userId,
                1,
                photoId,
                payment_method_id
            ]
        );

        res.redirect('/cabinet');

    } catch (error) {
        console.error('Ошибка добавления фотографии:', error);
        res.status(500).send('Ошибка добавления фотографии');
    }
});

const PORT = process.env.PORT || 3014;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});