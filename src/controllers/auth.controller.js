const jwt = require('jsonwebtoken')
const config = require('../config')
const pool = require('../db')
const {encryptPasword, comparePassword} = require('../libs/auth')
const {setFilters, setFiltersOR} = require('../libs/functions')

const signUp = async (req, res) => {
    try {
        const { username, password, email, type, id_company} = req.body;
        const now = new Date();
        const encrytedpass = await encryptPasword(password);
        
        const response = await pool.query(
            `INSERT INTO public.user( created, modified, username, password, email, type, id_company) 
            VALUES ( $1, $2, $3, $4, $5, $6, $7 )`,
            [ now, now, username, encrytedpass, email, type, null]);

        res.json({
            state: 'success',
            message: "User Created"
        })

    } catch (error) {
        console.log(error);
        res.status(500).json(error);
    }
};

const signIn = async (req, res) => {
    try {
        // Request body email can be an email or username
        const { email, username} = req.body;

        const userFound = await pool.query('SELECT * FROM public.user WHERE username = $1', [username]);

        if (!userFound.rows[0].password) 
            return res.status(400).json({ message: "User Not Found" });

        const matchPassword = await comparePassword(
            req.body.password,
            userFound.rows[0].password
        );
        
        if (!matchPassword)
            return res.status(401).json({
                token: null,
                message: "Invalid Password",
            });
        
        const token = await jwt.sign({ id: userFound.rows[0].id_user,  username: userFound.rows[0].username }, config.SECRET, {
            expiresIn: 86400, // 24 hours
        });

        res.json({ username: userFound.rows[0].username, token });

    } catch (error) {
        console.log(error);
        res.json({ error });
    }
};

const changePassword = async (req, res) => {
    try {
        // Request body email can be an email or username
        const { username, password, password1} = req.body;

        if (password !== password1) 
            return res.status(401).json({ message: "Invalid Passwords", });        
        
        const user = await pool.query(`SELECT EXISTS (SELECT 1 FROM public.user where username=$1)`, [username]);
        if (!user.rows[0].exists)
            return res.status(401).json({ message: "Invalid username" });

        const encrytedpass = await encryptPasword(password);
        const response = await pool.query('UPDATE public.user SET password=$1 WHERE username = $2 RETURNING *', [encrytedpass,username]);
        
        const token = jwt.sign({ id: response.id_user }, config.SECRET, {
            expiresIn: 86400, // 24 hours
        });

        res.json({ token });

    } catch (error) {
        console.log(error);
        res.json({ error });
    }
};

const getUsers = async (req, res, next) => {
    try {
        const { user, page, itemsPerPage} = req.query;
        let filters = { username: user, email: user }
        filters = setFiltersOR(filters)

        const response = await pool.query(`SELECT id_user, created, modified, username, email, type, id_company FROM public.user ${filters} ORDER BY id_user 
            LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`);

        const tocount = await pool.query(`SELECT id_user, created, modified, username, email, type, id_company FROM public.user ${filters}`)

        res.status(200).json({
            page: page,
            count: tocount.rows.length,
            data: response.rows
        });
    } catch (error) {
        console.log(error);
        res.json({ error });
    }
    
}

const getUserId = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const response = await pool.query('SELECT id_user, created, modified, username, email, type, id_company FROM public.user WHERE id_user = $1', [id]);
        res.status(200).json(response.rows);
    } catch (error) {
        console.log(error);
        res.json({ error });
    }
    
};

module.exports = {signUp, signIn, changePassword, getUsers, getUserId}