const pool = require('../db')

const checkDuplicateUsernameOrEmail = async (req, res, next) => {
    try {
        const user = await pool.query(`SELECT EXISTS (SELECT 1 FROM public.user where username=$1)`, [req.body.username]);
        if (user.rows[0].exists)
            return res.status(400).json({ message: "The user already exists" });

        const email = await pool.query(`SELECT EXISTS (SELECT 1 FROM public.user where email=$1)`, [req.body.email]);
        if (email.rows[0].exists)
        return res.status(400).json({ message: "The email already exists" });
        
        next();

    } catch (error) {
        res.status(500).json({ message: error });
    }
};

module.exports = {checkDuplicateUsernameOrEmail};