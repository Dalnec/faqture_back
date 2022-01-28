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
    if (filters){
        cadena += `company_number ILIKE '%${filters}%' OR `;
        cadena += `company ILIKE '%${filters}%' OR `;
    }
    return cadena.substring(0, cadena.lastIndexOf("OR"));
}

const setFiltersOR = (filters) => {
    let cadena = 'WHERE '
    for (let x in filters) {
        if (filters[x]){
            cadena += `${x} ILIKE '%${filters[x]}%' OR `;
        }
    }
    return cadena.substring(0, cadena.lastIndexOf("OR"));
}

const setNewValues = (values) => {
    let cadena = ''
    for (let x in values) {
        cadena += `${x}='${values[x]}', `;
    }
    return cadena.substring(0, cadena.lastIndexOf(","));
}


const setFiltersDocs = (filters) => {    
    let cadena = 'WHERE '
    for (let x in filters) {
        switch (x) {
            case 'date_from':
                cadena += `date >= '${filters[x]} 00:00:00' AND `;                
                break;        
            case 'date_to':
                cadena += `date <= '${filters[x]} 23:59:59' AND `;                
                break;        
            case 'date':
                cadena += `date BETWEEN '${filters[x]} 00:00:00' AND '${filters[x]} 23:59:59' AND `;                
                break;        
            default:
                cadena += `${x} = '${filters[x]}' AND `;
                break;
        }
    }
    return cadena.substring(0, cadena.lastIndexOf("AND "));
}

module.exports = {setFilters, setNewValues, setFiltersORCompany, setFiltersOR, setFiltersDocs};