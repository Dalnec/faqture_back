import {
    GuiaTransportista, DocumentBody, despatchSupplierParty, shipment, despatchLine,
    deliveryCustomerParty, TextValue, CbcCustomizationIDClass
} from './guiaTransportistaClass.js';

function completarConCeros(valor, longitud) {
    return valor.toString().padStart(longitud, '0');
}

export function adaptGuiaTransportista(company, data) {
    const { apisunat } = company.external_api
    const documentBody = new DocumentBody(
        new TextValue("2.1"),
        new CbcCustomizationIDClass("2.0"),
        new TextValue(`${data.serie_documento}-${completarConCeros(data.numero_documento, 8)}`),
        new TextValue(data.fecha_de_emision),
        new TextValue(data.hora_de_emision),
        new TextValue(data.codigo_tipo_documento),
        [new TextValue(data.observaciones || "-")],
        despatchSupplierParty(
            "6",
            company.company_number,
            company.company,
            company.address
        ), // datos de la empresa emisora
        deliveryCustomerParty(
            data.destinatario.codigo_tipo_documento_identidad,
            data.destinatario.numero_documento,
            data.destinatario.apellidos_y_nombres_o_razon_social
        ), // datos de la empresa receptora/destinatario
        shipment(
            "SUNAT_Envio",
            data.unidad_peso_total,
            data.peso_total,
            data.numero_de_bultos,
            data.fecha_de_traslado,
            "6", /* "schemeID": "6" puede q siempre sea '6' */
            data.mtc,
            data.chofer.codigo_tipo_documento_identidad,
            data.chofer.numero_documento,
            data.chofer.nombres,
            data.chofer.apellidos || "-",
            data.chofer.numero_licencia,
            data.direccion_partida_remitente.ubigeo,
            data.direccion_partida_remitente.direccion,
            data.direccion_llegada_destinatario.ubigeo,
            data.direccion_llegada_destinatario.direccion,
            data.vehiculo.numero_de_placa,
            data.tuc
        ),
        data.items.map((item, index) => despatchLine(index + 1, item.codigo_interno, item.cantidad, item.descripcion)) // [despatchLine()]
    );

    return new GuiaTransportista(
        apisunat.personaId,
        apisunat.personaToken,
        `${company.company_number}-31-${data.serie_documento}-${completarConCeros(data.numero_documento, 8)}`, // "20494070686-31-V001-00000001",
        documentBody
    );
}
