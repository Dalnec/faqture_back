function toGuiaTransportista(json) {
    return cast(JSON.parse(json), r("GuiaTransportista"));
}

function guiaTransportistaToJson(value) {
    return JSON.stringify(uncast(value, r("GuiaTransportista")), null, 2);
}

function invalidValue(typ, val, key, parent = '') {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ) {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ) {
    if (typ.jsonToJS === undefined) {
        const map = {};
        typ.props.forEach((p) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ) {
    if (typ.jsToJSON === undefined) {
        const map = {};
        typ.props.forEach((p) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val, typ, getProps, key = '', parent = '') {
    function transformPrimitive(typ, val) {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs, val) {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) { }
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases, val) {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ, val) {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val) {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props, additional, val) {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems") ? transformArray(typ.arrayItems, val)
                : typ.hasOwnProperty("props") ? transformObject(getProps(typ), typ.additional, val)
                    : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast(val, typ) {
    return transform(val, typ, jsonToJSProps);
}

function uncast(val, typ) {
    return transform(val, typ, jsToJSONProps);
}

function l(typ) {
    return { literal: typ };
}

function a(typ) {
    return { arrayItems: typ };
}

function u(...typs) {
    return { unionMembers: typs };
}

function o(props, additional) {
    return { props, additional };
}

function m(additional) {
    return { props: [], additional };
}

function r(name) {
    return { ref: name };
}

const typeMap = {
    "GuiaTransportista": o([
        { json: "personaId", js: "personaId", typ: "" },
        { json: "personaToken", js: "personaToken", typ: "" },
        { json: "fileName", js: "fileName", typ: "" },
        { json: "documentBody", js: "documentBody", typ: r("DocumentBody") },
    ], false),
    "DocumentBody": o([
        { json: "cbc:UBLVersionID", js: "cbc:UBLVersionID", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:CustomizationID", js: "cbc:CustomizationID", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:ID", js: "cbc:ID", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:IssueDate", js: "cbc:IssueDate", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:IssueTime", js: "cbc:IssueTime", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:DespatchAdviceTypeCode", js: "cbc:DespatchAdviceTypeCode", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:Note", js: "cbc:Note", typ: a(r("CbcCustomizationIDClass")) },
        { json: "cac:DespatchSupplierParty", js: "cac:DespatchSupplierParty", typ: r("CacDespatchSupplierParty") },
        { json: "cac:DeliveryCustomerParty", js: "cac:DeliveryCustomerParty", typ: r("CacDeliveryCustomerParty") },
        { json: "cac:Shipment", js: "cac:Shipment", typ: r("CacShipment") },
        { json: "cac:DespatchLine", js: "cac:DespatchLine", typ: a(r("CacDespatchLine")) },
    ], false),
    "CacDeliveryCustomerParty": o([
        { json: "cac:Party", js: "cac:Party", typ: r("CacParty") },
    ], false),
    "CacParty": o([
        { json: "cac:PartyIdentification", js: "cac:PartyIdentification", typ: r("CacPartyCacPartyIdentification") },
        { json: "cac:PartyLegalEntity", js: "cac:PartyLegalEntity", typ: r("CacDespatchPartyCacPartyLegalEntity") },
    ], false),
    "CacPartyCacPartyIdentification": o([
        { json: "cbc:ID", js: "cbc:ID", typ: r("CacDriverPersonCbcID") },
    ], false),
    "CacDriverPersonCbcID": o([
        { json: "_attributes", js: "_attributes", typ: r("CbcIDAttributes") },
        { json: "_text", js: "_text", typ: "" },
    ], false),
    "CbcIDAttributes": o([
        { json: "schemeID", js: "schemeID", typ: "" },
    ], false),
    "CacDespatchPartyCacPartyLegalEntity": o([
        { json: "cbc:RegistrationName", js: "cbc:RegistrationName", typ: r("CbcCustomizationIDClass") },
    ], false),
    "CbcCustomizationIDClass": o([
        { json: "_text", js: "_text", typ: "" },
    ], false),
    "CacDespatchLine": o([
        { json: "cbc:ID", js: "cbc:ID", typ: r("CbcID") },
        { json: "cbc:DeliveredQuantity", js: "cbc:DeliveredQuantity", typ: r("CbcGrossWeightMeasureClass") },
        { json: "cac:OrderLineReference", js: "cac:OrderLineReference", typ: r("CacOrderLineReference") },
        { json: "cac:Item", js: "cac:Item", typ: r("CacItem") },
    ], false),
    "CacItem": o([
        { json: "cbc:Description", js: "cbc:Description", typ: r("CbcCustomizationIDClass") },
    ], false),
    "CacOrderLineReference": o([
        { json: "cbc:LineID", js: "cbc:LineID", typ: r("CbcID") },
    ], false),
    "CbcID": o([
        { json: "_text", js: "_text", typ: 0 },
    ], false),
    "CbcGrossWeightMeasureClass": o([
        { json: "_attributes", js: "_attributes", typ: r("CbcGrossWeightMeasureAttributes") },
        { json: "_text", js: "_text", typ: 0 },
    ], false),
    "CbcGrossWeightMeasureAttributes": o([
        { json: "unitCode", js: "unitCode", typ: "" },
    ], false),
    "CacDespatchSupplierParty": o([
        { json: "cac:Party", js: "cac:Party", typ: r("CacDespatchSupplierPartyCacParty") },
    ], false),
    "CacDespatchSupplierPartyCacParty": o([
        { json: "cac:PartyIdentification", js: "cac:PartyIdentification", typ: r("CacPartyCacPartyIdentification") },
        { json: "cac:PartyLegalEntity", js: "cac:PartyLegalEntity", typ: r("PurpleCacPartyLegalEntity") },
    ], false),
    "PurpleCacPartyLegalEntity": o([
        { json: "cbc:RegistrationName", js: "cbc:RegistrationName", typ: r("CbcCustomizationIDClass") },
        { json: "cac:RegistrationAddress", js: "cac:RegistrationAddress", typ: r("CacRegistrationAddress") },
    ], false),
    "CacRegistrationAddress": o([
        { json: "cac:AddressLine", js: "cac:AddressLine", typ: r("CacAddressLine") },
    ], false),
    "CacAddressLine": o([
        { json: "cbc:Line", js: "cbc:Line", typ: r("CbcCustomizationIDClass") },
    ], false),
    "CacShipment": o([
        { json: "cbc:ID", js: "cbc:ID", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:GrossWeightMeasure", js: "cbc:GrossWeightMeasure", typ: r("CbcGrossWeightMeasureClass") },
        { json: "cac:ShipmentStage", js: "cac:ShipmentStage", typ: r("CacShipmentStage") },
        { json: "cac:Delivery", js: "cac:Delivery", typ: r("CacDelivery") },
        { json: "cac:TransportHandlingUnit", js: "cac:TransportHandlingUnit", typ: r("CacTransportHandlingUnit") },
    ], false),
    "CacDelivery": o([
        { json: "cac:DeliveryAddress", js: "cac:DeliveryAddress", typ: r("CacDeAddress") },
        { json: "cac:Despatch", js: "cac:Despatch", typ: r("CacDespatch") },
    ], false),
    "CacDeAddress": o([
        { json: "cbc:ID", js: "cbc:ID", typ: r("CbcCustomizationIDClass") },
        { json: "cac:AddressLine", js: "cac:AddressLine", typ: r("CacAddressLine") },
    ], false),
    "CacDespatch": o([
        { json: "cac:DespatchAddress", js: "cac:DespatchAddress", typ: r("CacDeAddress") },
        { json: "cac:DespatchParty", js: "cac:DespatchParty", typ: r("CacParty") },
    ], false),
    "CacShipmentStage": o([
        { json: "cac:TransitPeriod", js: "cac:TransitPeriod", typ: r("CacTransitPeriod") },
        { json: "cac:CarrierParty", js: "cac:CarrierParty", typ: r("CacCarrierParty") },
        { json: "cac:DriverPerson", js: "cac:DriverPerson", typ: a(r("CacDriverPerson")) },
    ], false),
    "CacCarrierParty": o([
        { json: "cac:PartyIdentification", js: "cac:PartyIdentification", typ: r("CacCarrierPartyCacPartyIdentification") },
        { json: "cac:PartyLegalEntity", js: "cac:PartyLegalEntity", typ: r("CacCarrierPartyCacPartyLegalEntity") },
    ], false),
    "CacCarrierPartyCacPartyIdentification": o([
        { json: "cbc:ID", js: "cbc:ID", typ: r("PurpleCbcID") },
    ], false),
    "PurpleCbcID": o([
        { json: "_attributes", js: "_attributes", typ: r("CbcIDAttributes") },
    ], false),
    "CacCarrierPartyCacPartyLegalEntity": o([
        { json: "cbc:CompanyID", js: "cbc:CompanyID", typ: r("CbcCustomizationIDClass") },
    ], false),
    "CacDriverPerson": o([
        { json: "cbc:ID", js: "cbc:ID", typ: r("CacDriverPersonCbcID") },
        { json: "cbc:FirstName", js: "cbc:FirstName", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:FamilyName", js: "cbc:FamilyName", typ: r("CbcCustomizationIDClass") },
        { json: "cbc:JobTitle", js: "cbc:JobTitle", typ: r("CbcCustomizationIDClass") },
        { json: "cac:IdentityDocumentReference", js: "cac:IdentityDocumentReference", typ: r("CacIdentityDocumentReference") },
    ], false),
    "CacIdentityDocumentReference": o([
        { json: "cbc:ID", js: "cbc:ID", typ: r("CbcCustomizationIDClass") },
    ], false),
    "CacTransitPeriod": o([
        { json: "cbc:StartDate", js: "cbc:StartDate", typ: r("CbcCustomizationIDClass") },
    ], false),
    "CacTransportHandlingUnit": o([
        { json: "cac:TransportEquipment", js: "cac:TransportEquipment", typ: r("CacTransportEquipment") },
    ], false),
    "CacTransportEquipment": o([
        { json: "cbc:ID", js: "cbc:ID", typ: r("CbcCustomizationIDClass") },
        { json: "cac:ApplicableTransportMeans", js: "cac:ApplicableTransportMeans", typ: r("CacApplicableTransportMeans") },
    ], false),
    "CacApplicableTransportMeans": o([
        { json: "cbc:RegistrationNationalityID", js: "cbc:RegistrationNationalityID", typ: r("CbcCustomizationIDClass") },
    ], false),
};

module.exports = {
    "guiaTransportistaToJson": guiaTransportistaToJson,
    "toGuiaTransportista": toGuiaTransportista,
};
