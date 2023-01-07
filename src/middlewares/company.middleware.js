const { selectApiCompanyByTenant } = require("../libs/company.libs")

const verifyCompanyByTenant = async (req, res, next) => {
    try {
        const {tenant} = req.params
        if (!tenant){
            return res.status(403).json({ error: 'No Tenant' })
        }
        const company = await selectApiCompanyByTenant(tenant)
        req.company = company

        return next()

    } catch (error) {
        console.log(e)
        return res.status(409).send({ error: e })
    }
}

module.exports = { verifyCompanyByTenant}