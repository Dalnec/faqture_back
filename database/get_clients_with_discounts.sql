CREATE OR REPLACE FUNCTION get_tenants_with_discount_docs(
    max_tenants INTEGER DEFAULT 10,
    max_docs_per_tenant INTEGER DEFAULT 5
)
RETURNS TABLE(
    tenant_name VARCHAR(150),
    id_document INT,
    serie VARCHAR(5),
    numero BIGINT,
    type VARCHAR(2),
    date TIMESTAMP,
    customer_number VARCHAR(20),
    customer VARCHAR(255),
    amount NUMERIC(10,2),
    states VARCHAR(1)
)
LANGUAGE plpgsql
AS $$
DECLARE
    company_rec RECORD;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _matched_tenants (name VARCHAR(150)) ON COMMIT DROP;
    TRUNCATE _matched_tenants;

    FOR company_rec IN
        SELECT company.tenant FROM public.company WHERE state = true ORDER BY company.tenant
    LOOP
        EXIT WHEN (SELECT count(*) FROM _matched_tenants) >= max_tenants;

        EXECUTE format(
            'INSERT INTO _matched_tenants SELECT %L
             WHERE EXISTS (SELECT 1 FROM %I.document WHERE json_format::text LIKE ''%%\\"descuent%%'')',
            company_rec.tenant, company_rec.tenant
        );
    END LOOP;

    FOR company_rec IN SELECT name FROM _matched_tenants ORDER BY name LOOP
        RETURN QUERY EXECUTE format(
            'SELECT %L::VARCHAR(150), id_document, serie, numero, type, date,
                    customer_number, customer, amount, states
             FROM %I.document
             WHERE json_format::text LIKE ''%%\\"descuent%%''
             ORDER BY id_document DESC
             LIMIT %L',
            company_rec.name, company_rec.name, max_docs_per_tenant
        );
    END LOOP;
END;
$$;
