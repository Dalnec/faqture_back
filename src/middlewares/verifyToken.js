const jwt = require("jsonwebtoken");
const config = require("../config");

const verifyToken = async (req, res, next) => {
    try {
        // Get the token from the headers
        const token = req.headers["x-access-token"];
        // if does not exists a token
        if (!token) {
            return res
                .status(401)
                .send({ auth: false, message: "No Token Provided" });
        }

        // decode the token
        const decoded = await jwt.verify(token, config.SECRET);
        // save the token on request object to using on routes
        req.userId = decoded.id;
        req.userName = decoded.username;

        // continue with the next function
        next();
    } catch (error) {
        res.status(401).json({
            state: 'error',
            message: error.message,
        })
    }

}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (token == null) return res.sendStatus(401)

    // jwt.verify(token, config.SECRET as string, (err: any, user: any) => {
    //     console.log(err)

    //     if (err) return res.sendStatus(403)

    //     req.user = user

    //     next()
    // })
}

module.exports = { verifyToken }