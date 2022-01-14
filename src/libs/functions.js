const setFilters = (filters) => {
    // if (!filters || typeof filters !== 'object') 
    //     return 'Parameter \'filters\' must be an object.'
    
    let cadena = 'WHERE '
    for (let x in filters) {
        cadena += `${x} = '${filters[x]}' AND `;
    }
    return cadena.substring(0, cadena.lastIndexOf("AND"));
}

const setFiltersORCompany = (filters) => {
    let cadena = 'WHERE '
    // for (let x in filters) {
        if (filters){
            cadena += `company_number LIKE '%${filters}%' OR `;
            cadena += `company LIKE '%${filters}%' OR `;
        }
    // }
    console.log("ORCompany------", cadena);
    return cadena.substring(0, cadena.lastIndexOf("OR"));
}

const setFiltersOR = (filters) => {
    let cadena = 'WHERE '
    for (let x in filters) {
        if (filters[x]){
            cadena += `${x} ILIKE '%${filters[x]}%' OR `;
        }
    }
    console.log("OR*****", cadena);
    return cadena.substring(0, cadena.lastIndexOf("OR"));
}

const setNewValues = (values) => {
    let cadena = ''
    for (let x in values) {
        cadena += `"${x}"='${values[x]}', `;
    }
    return cadena.substring(0, cadena.lastIndexOf(","));
}

module.exports = {setFilters, setNewValues, setFiltersORCompany, setFiltersOR};