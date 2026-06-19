CREATE SCHEMA prueba1 AUTHORIZATION faqture;
CREATE DATABASE faqturedb;
CREATE TABLE public.company(
    id_company SERIAL,
    created timestamp with time zone NOT NULL,
    modified timestamp with time zone NOT NULL,
    company_number character varying(20) NOT NULL,
    company character varying(255) NOT NULL,
    tenant character varying(150) NOT NULL UNIQUE,
    --UNIQUE(tenant)
    url character varying(255),
    token character varying(255),
    localtoken character varying(255),
    state BOOLEAN NOT NULL DEFAULT TRUE,
    zenda_url character varying(255),
    zenda_token character varying(255),
    zenda_state BOOLEAN NOT NULL DEFAULT TRUE,
    token_series jsonb,
    PRIMARY KEY (id_company)
);
CREATE TABLE document(
    id_document SERIAL,
    created timestamp NOT NULL,
    --created timestamp with time zone NOT NULL,
    modified timestamp NOT NULL,
    --modified timestamp with time zone NOT NULL,
    -- date VARCHAR(10),
    date timestamp NOT NULL,
    cod_sale VARCHAR(100) NOT NULL,
    type VARCHAR(2),
    serie VARCHAR(5),
    numero bigint NOT NULL,
    customer_number character varying(20) NOT NULL,
    customer character varying(255) NOT NULL,
    amount numeric(10, 2) NOT NULL,
    states VARCHAR(1),
    json_format jsonb,
    response_send jsonb,
    response_anulate jsonb,
    id_company bigint,
    external_id VARCHAR(50),
    verified BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (id_document) UNIQUE (serie, numero) -- CONSTRAINT company_document_fk
    --     FOREIGN KEY(id_company) 
    --     REFERENCES company(id_company)
);
CREATE TABLE public.user(
    id_user SERIAL,
    created timestamp with time zone NOT NULL,
    modified timestamp with time zone NOT NULL,
    username character varying(20) NOT NULL,
    --UNIQUE?
    password character varying(255) NOT NULL,
    email character varying(255),
    type character varying(50) NOT NULL,
    PRIMARY KEY (id_user),
    id_company jsonb -- id_company bigint,
    settings jsonb,
    -- CONSTRAINT company_document_fk
    --     FOREIGN KEY(id_company) 
    --     REFERENCES company(id_company)
);
--ALTER/UPDATE COLUMN
ALTER TABLE public.user
ALTER COLUMN password TYPE varchar(255);
--ALTER/UPDATE COLUMN
ALTER TABLE public.user
ALTER COLUMN settings jsonb;
--ADD COLUMN
ALTER TABLE public.company
ADD COLUMN localtoken varying(255) constraint;
--DROP COLUMN
ALTER TABLE public.user DROP COLUMN token
ALTER TABLE public.company
ADD COLUMN autosend BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.company
ADD COLUMN address varchar(200);
ALTER TABLE public.company
ADD COLUMN ubigeo varchar(20);
ALTER TABLE public.company
ADD COLUMN external_api jsonb;
-- cron_enabled: excluye empresa del envío por tareas programadas (sigue recepcionando docs normalmente)
ALTER TABLE public.company
ADD COLUMN cron_enabled BOOLEAN NOT NULL DEFAULT TRUE;
-- cron_failure_count: contador de fallos consecutivos de autenticación en el cron (se resetea al éxito)
ALTER TABLE public.company
ADD COLUMN cron_failure_count SMALLINT NOT NULL DEFAULT 0;
-- source_type: identifica el sistema de origen de los comprobantes (Zenda, FLizzy, Kenani, Farma, etc.)
ALTER TABLE public.company
ADD COLUMN source_type VARCHAR(50);
-- TASK TABLE
CREATE TABLE public.tasks(
    id_task SERIAL,
    created timestamp NOT NULL,
    modified timestamp NOT NULL,
    name character varying(100),
    state varchar(1) DEFAULT 'N',
    on_off BOOLEAN NOT NULL DEFAULT FALSE,
    time character varying(100),
    PRIMARY KEY (id_task)
);
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS last_error TEXT;
-- SETTINGS TABLE
CREATE TABLE public.settings(
    id_settings SMALLINT,
    key character varying(100) NOT NULL,
    value character varying(255) NOT NULL,
    description character varying(255) NULL,
    category character varying(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id_settings)
);
-- Add "external_id" column to all the schemas
do $$
declare f record;
begin for f in
SELECT nspname
FROM pg_namespace n
WHERE nspname !~~ 'pg_%'
    AND nspname <> 'information_schema'
    AND nspname <> 'public' loop raise notice '%',
    f.nspname;
EXECUTE 'SET LOCAL search_path = ' || f.nspname;
ALTER TABLE document
ADD COLUMN IF NOT EXISTS external_id VARCHAR(50);
end loop;
end;
$$ -- Altering column "cod_sale" to all the schemas
do $$
declare f record;
begin for f in
SELECT nspname
FROM pg_namespace n
WHERE nspname !~~ 'pg_%'
    AND nspname <> 'information_schema'
    AND nspname <> 'public' loop raise notice '%',
    f.nspname;
EXECUTE 'SET LOCAL search_path = ' || f.nspname;
ALTER TABLE document
ALTER COLUMN cod_sale TYPE VARCHAR(100);
end loop;
end;
$$ -- Add column "verified" to all the schemas
do $$
declare f record;
begin for f in
SELECT nspname
FROM pg_namespace n
WHERE nspname !~~ 'pg_%'
    AND nspname <> 'information_schema'
    AND nspname <> 'public' loop raise notice '%',
    f.nspname;
EXECUTE 'SET LOCAL search_path = ' || f.nspname;
ALTER TABLE document
ADD COLUMN IF NOT EXISTS verified BOOLEAN;
end loop;
end;
$$ -- update columna cod_sale
do $$
declare f record;
begin for f in
SELECT nspname
FROM pg_namespace n
WHERE nspname !~~ 'pg_%'
    AND nspname <> 'information_schema'
    AND nspname <> 'public' loop raise notice '%',
    f.nspname;
EXECUTE 'SET LOCAL search_path = ' || f.nspname;
UPDATE document
SET cod_sale = SUBSTRING(
        cod_sale
        FROM '^[^-]+'
    );
end loop;
end;
$$ -- Select all companies with zenda_token
SELECT zenda_url,
    zenda_token
FROM public.company
WHERE zenda_token IS NOT NULL;
-- Update states to 'K' for documents of type '80' in all schemas
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT nspname
        FROM pg_namespace n
        WHERE nspname NOT LIKE 'pg_%'
          AND nspname <> 'information_schema'
          AND nspname <> 'public'
    LOOP
        RAISE NOTICE 'Actualizando schema: %', f.nspname;

        EXECUTE format(
            'UPDATE %I.document
             SET states = ''K''
             WHERE type = ''80'';',
            f.nspname
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;
