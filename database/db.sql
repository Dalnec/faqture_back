CREATE SCHEMA prueba1
    AUTHORIZATION faqture;

CREATE DATABASE faqturedb

CREATE TABLE public.company(
    id_company SERIAL,
    created timestamp with time zone NOT NULL,
    modified timestamp with time zone NOT NULL,
    company_number character varying(20) NOT NULL,
    company character varying(255) NOT NULL,
    tenant character varying(150) NOT NULL UNIQUE, --UNIQUE(tenant)
    url character varying(255),
    token character varying(255),
    localtoken character varying(255),
    state BOOLEAN NOT NULL DEFAULT TRUE,
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
    cod_sale bigint NOT NULL,
    type VARCHAR(2),
    serie VARCHAR(5),
    numero bigint NOT NULL,
    customer_number character varying(20) NOT NULL,
    customer character varying(255) NOT NULL,
    amount numeric(10,2) NOT NULL,
    states VARCHAR(1),
    json_format jsonb,
    response_send jsonb,
    response_anulate jsonb,
	id_company bigint,
    PRIMARY KEY (id_document)
    UNIQUE (serie, numero)
    -- CONSTRAINT company_document_fk
    --     FOREIGN KEY(id_company) 
    --     REFERENCES company(id_company)
);

CREATE TABLE public.user(
    id_user SERIAL,
    created timestamp with time zone NOT NULL,
    modified timestamp with time zone NOT NULL,
    username character varying(20) NOT NULL, --UNIQUE?
    password character varying(255) NOT NULL,
    email character varying(255),
    type character varying(50) NOT NULL,
    PRIMARY KEY (id_user),
    id_company jsonb
    -- id_company bigint,
    -- CONSTRAINT company_document_fk
    --     FOREIGN KEY(id_company) 
    --     REFERENCES company(id_company)
);

--ALTER/UPDATE COLUMN
ALTER TABLE public.user ALTER COLUMN password TYPE varchar(255);

--ADD COLUMN
ALTER TABLE public.company 
ADD COLUMN localtoken varying(255) constraint;

--DROP COLUMN
ALTER TABLE public.user 
DROP COLUMN token


CREATE TABLE public.tasks(
    id_task SERIAL,
    created timestamp NOT NULL,
    modified timestamp NOT NULL,
    name character varying(100),
    state BOOLEAN NOT NULL DEFAULT FALSE,
    on_off BOOLEAN NOT NULL DEFAULT FALSE,
    time character varying(100),
    PRIMARY KEY (id_task)
);