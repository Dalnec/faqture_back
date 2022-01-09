const getAllSchemas = (name, pool) => {
    let selectSchema = `SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${name}';`
    await pool.query(selectSchema, (err, res) => {
            
        })
}

const getAllSchemas = (name) => {
    let selectSchemasSql = 'SELECT schema_name FROM information_schema.schemata;'
    await pool.query(selectSchemasSql, (err, res) => {

        // Log the SQL statement to console
        console.log('\nselectSchemasSql:', selectSchemasSql)

        // Check for Postgres exceptions
        if (err) {
            console.log("SELECT schema_name:", schemaCodes[err.code])
            console.log("ERROR code:", err.code)
        } else if (res.rows !== undefined) {

            // Iterate over the rows of Postgres schema names
            res.rows.forEach(row => {
                // Push the schema's name to the array
                pgSchemas.push( row.schema_name )
            })
            
            // Log the number of Postgres schema names to console
            console.log("schema names:", pgSchemas)
            console.log("SELECT schema_name total schemas:", res.rowCount)
            }
        })
}
