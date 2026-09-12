const { getZendyChannelsList } = require('../libs/zendy.lib');

const getZendyChannels = async (req, res, next) => {
    try {
        const data = await getZendyChannelsList();
        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('[getZendyChannels] Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Error al consultar canales de Zendy'
        });
    }
};

module.exports = {
    getZendyChannels
};
