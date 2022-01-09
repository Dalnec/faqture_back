CREATE SCHEMA prueba1
    AUTHORIZATION faqture;

CREATE DATABASE faqturedb

CREATE TABLE company(
    id_company SERIAL,
    created timestamp with time zone NOT NULL,
    modified timestamp with time zone NOT NULL,
    company_number character varying(20) NOT NULL,
    company character varying(255) NOT NULL,
    url character varying(255),
    token character varying(255),
    PRIMARY KEY (id_company)
);

CREATE TABLE document(
    id_document SERIAL,
    created timestamp with time zone NOT NULL,
    modified timestamp with time zone NOT NULL,
    date VARCHAR(10),
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
    PRIMARY KEY (id_document),
    -- CONSTRAINT company_document_fk
    --     FOREIGN KEY(id_company) 
    --     REFERENCES company(id_company)
);