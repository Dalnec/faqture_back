const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

// Importar rutas
const routerAuth = require('./routes/auth.routes');
const routerDocuments = require('./routes/documents.routes');
const routerTenants = require('./routes/tenants.routes');
const routerCompanies = require('./routes/companies.routes');
const routerApi = require('./routes/api.routes');
const routerTasks = require('./routes/tasks.routes');
const routerSettings = require('./routes/settings.routes');
const routerWhatsapp = require('./routes/whatsapp.router');

// Inicializar app
const app = express();

// Configuración
const PORT = process.env.PORT || 4000;
const URLDOCS = process.env.URLDOCS || `http://localhost:${PORT}`;

// Middlewares
app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Configuración de Swagger
const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Documentación Faqture API",
            version: "1.0.0",
            description: "Documentación de la API con Swagger",
        },
        servers: [
            {
                url: URLDOCS,
            },
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: ["./src/routes/*.js"], // Ruta a los archivos de rutas
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Rutas
app.use(routerAuth);
app.use(routerDocuments);
app.use(routerTenants);
app.use(routerCompanies);
app.use(routerApi);
app.use(routerTasks);
app.use(routerSettings);
app.use(routerWhatsapp);

// Manejo de rutas inexistentes (404)
app.use((req, res) => {
    res.status(404).json({
        status: "error",
        message: "Ruta no encontrada",
    });
});

// Manejo de errores
app.use((err, req, res, next) => {
    res.status(500).json({
        status: "error",
        message: err.message || "Error interno del servidor",
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Documentación disponible en http://localhost:${PORT}/docs`);
});
