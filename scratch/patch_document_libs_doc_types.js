const fs = require('fs');
const filePath = 'c:/Factures/faqture_back/src/libs/document.libs.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add buildTypeClause helper
const helperCode = `const buildTypeClause = (docTypes) => {
    if (Array.isArray(docTypes) && docTypes.length > 0) {
        const cleanTypes = docTypes.filter(t => /^[0-9a-zA-Z]+$/.test(t)).map(t => \`'\${t}'\`);
        if (cleanTypes.length > 0) {
            return \`type IN (\${cleanTypes.join(',')})\`;
        }
    }
    return "type <> '80'";
};

`;

if (!content.includes('const buildTypeClause')) {
    content = content.replace('const select_all_documents = async (tenant) => {', helperCode + 'const select_all_documents = async (tenant, docTypes = null) => {');
} else {
    content = content.replace('const select_all_documents = async (tenant) => {', 'const select_all_documents = async (tenant, docTypes = null) => {');
}

// 2. Update select_all_documents query
content = content.replace(
    "const docs = await pool.query(`SELECT id_document, cod_sale, serie, numero, json_format, states, type, response_send, external_id FROM ${tenant}.document WHERE states in ('N', 'X', 'M', 'S') AND type <> '80' ORDER BY id_document limit 100`);",
    "const docs = await pool.query(`SELECT id_document, cod_sale, serie, numero, json_format, states, type, response_send, external_id FROM ${tenant}.document WHERE states in ('N', 'X', 'M', 'S') AND ${buildTypeClause(docTypes)} ORDER BY id_document limit 100`);"
);

// 3. Update select_error_documents
content = content.replace(
    'const select_error_documents = async (tenant) => {',
    'const select_error_documents = async (tenant, docTypes = null) => {'
);
content = content.replace(
    "const docs = await pool.query(`SELECT id_document, cod_sale, serie, numero, json_format, states, type, response_send, external_id, date, amount FROM ${tenant}.document WHERE states IN ('X', 'M', 'S', 'Z') AND type <> '80' ORDER BY id_document ASC LIMIT 50`);",
    "const docs = await pool.query(`SELECT id_document, cod_sale, serie, numero, json_format, states, type, response_send, external_id, date, amount FROM ${tenant}.document WHERE states IN ('X', 'M', 'S', 'Z') AND ${buildTypeClause(docTypes)} ORDER BY id_document ASC LIMIT 50`);"
);

// 4. Update select_all_documents_to_anulate
content = content.replace(
    'const select_all_documents_to_anulate = async (tenant) => {',
    'const select_all_documents_to_anulate = async (tenant, docTypes = null) => {'
);
content = content.replace(
    "const docs = await pool.query(`SELECT id_document, json_format, states, response_send, type, serie, numero, date, amount FROM ${tenant}.document WHERE states in ('P', 'Z') ORDER BY id_document limit 50`);",
    "const docs = await pool.query(`SELECT id_document, json_format, states, response_send, type, serie, numero, date, amount FROM ${tenant}.document WHERE states in ('P', 'Z') AND ${buildTypeClause(docTypes)} ORDER BY id_document limit 50`);"
);

// 5. Update select_all_documents_to_consult_void
content = content.replace(
    'const select_all_documents_to_consult_void = async (tenant) => {',
    'const select_all_documents_to_consult_void = async (tenant, docTypes = null) => {'
);
content = content.replace(
    "const docs = await pool.query(`SELECT id_document, json_format, states, response_send, response_anulate, type FROM ${tenant}.document WHERE states = 'C' ORDER BY id_document limit 50`);",
    "const docs = await pool.query(`SELECT id_document, json_format, states, response_send, response_anulate, type FROM ${tenant}.document WHERE states = 'C' AND ${buildTypeClause(docTypes)} ORDER BY id_document limit 50`);"
);

// 6. Update formatAnulatePerCompany
content = content.replace(
    'const formatAnulatePerCompany = async (tenant, company = null) => {',
    'const formatAnulatePerCompany = async (tenant, company = null, docTypes = null) => {'
);
content = content.replace(
    'const docs = await select_all_documents_to_anulate(tenant)',
    'const docs = await select_all_documents_to_anulate(tenant, docTypes)'
);

// 7. Update sendAllDocsAllCompanies
content = content.replace(
    'const docus = await select_all_documents(company.tenant);',
    'const docus = await select_all_documents(company.tenant, options?.docTypes);'
);

// 8. Update sendAllAnulateDocsAllCompanies
content = content.replace(
    'const sendAllAnulateDocsAllCompanies = async () => {',
    'const sendAllAnulateDocsAllCompanies = async (options = {}) => {'
);
content = content.replace(
    'const listformat = await formatAnulatePerCompany(company.tenant, company)',
    'const listformat = await formatAnulatePerCompany(company.tenant, company, options?.docTypes)'
);

// 9. Update consultAllAnulateDocsAllCompanies
content = content.replace(
    'const consultAllAnulateDocsAllCompanies = async () => {',
    'const consultAllAnulateDocsAllCompanies = async (options = {}) => {'
);
content = content.replace(
    'const docs = await select_all_documents_to_consult_void(company.tenant)',
    'const docs = await select_all_documents_to_consult_void(company.tenant, options?.docTypes)'
);

// 10. Update verifyErrorDocsAllCompanies
content = content.replace(
    'const docs = await select_error_documents(company.tenant);',
    'const docs = await select_error_documents(company.tenant, options?.docTypes);'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated document.libs.js with doc_types filter support');
