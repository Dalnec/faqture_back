const setFilters = (filters) => {
    // if (!filters || typeof filters !== 'object') 
    //     return 'Parameter \'filters\' must be an object.'
    
    let cadena = 'WHERE '
    for (let x in filters) {
        cadena += `${x} = '${filters[x]}' AND `;
    }
    return cadena.substring(0, cadena.lastIndexOf("AND"));
}

module.exports = setFilters;