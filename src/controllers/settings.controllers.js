const pool = require('../db');

const getSettings = async (req, res, next) => {
    const response = await pool.query(`SELECT * FROM public.settings ORDER BY id_settings`);
    res.status(200).json({
        success: true,
        message: "Settings!",
        data: response.rows
    })

}

const updateSetting = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id)
        const { value } = req.body;
        const r = await pool.query(`UPDATE public.settings SET value=$1 WHERE id_settings=$2`, [value, id]);
        res.status(200).json({
            success: true,
            message: "Setting Updated!",
            data: r
        })
    } catch (error) {
        console.log(error);
        res.status(401).json({
            success: false,
            message: error.message
        })
    }
}

module.exports = {
    getSettings,
    updateSetting,
}