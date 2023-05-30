const verifyWsp = async (req, res, next) => {
    try {
        const { countryCode, phoneNumber, message } = req.body
        if (!countryCode) {
            return res.status(409).send({ error: 'Country Code No Valid!' })
        }
        if (!isInt(phoneNumber.split(" ").join("").trim())) {
            return res.status(409).send({ error: 'Phone Number No Valid!' })
        } else {
            req.body.phoneNumber = phoneNumber.split(" ").join("").trim()
        }
        next();
    } catch (e) {
        console.log(e)
        return res.status(409).send({ error: 'Whatsapp Service Error' })
    }
}

function isInt(value) {
    if (isNaN(value)) {
        return false;
    }
    var x = parseFloat(value);
    return (x | 0) === x;
}

module.exports = { verifyWsp }