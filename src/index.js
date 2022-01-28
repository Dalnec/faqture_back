const express = require('express');
const cors = require("cors");
const morgan = require("morgan");
const routerAuth = require('./routes/auth.routes')
const routerDocuments = require('./routes/documents.routes')
const routerTenants = require('./routes/tenants.routes')
const routerCompanies = require('./routes/companies.routes')
const routerApi = require('./routes/api.routes')
const routerTasks = require('./routes/tasks.routes')

const app = express()

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

//routes
app.use(routerAuth);
app.use(routerDocuments);
app.use(routerTenants);
app.use(routerCompanies);
app.use(routerApi);
app.use(routerTasks);


// handling errors
app.use((err, req, res, next) => {
    return res.status(500).json({
        status: "error",
        message: err.message,
    });
});

app.listen(3000)
console.log('Server on port 3000');