class GuiaTransportista {
    constructor(personaId, personaToken, fileName, documentBody) {
        this.personaId = personaId;
        this.personaToken = personaToken;
        this.fileName = fileName;
        this.documentBody = documentBody;
    }
}

class DocumentBody {
    constructor(UBLVersionID, CustomizationID, ID, IssueDate, IssueTime, DespatchAdviceTypeCode, Note, DespatchSupplierParty, DeliveryCustomerParty, Shipment, DespatchLine) {
        this["cbc:UBLVersionID"] = UBLVersionID;
        this["cbc:CustomizationID"] = CustomizationID;
        this["cbc:ID"] = ID;
        this["cbc:IssueDate"] = IssueDate;
        this["cbc:IssueTime"] = IssueTime;
        this["cbc:DespatchAdviceTypeCode"] = DespatchAdviceTypeCode;
        this["cbc:Note"] = Note;
        this["cac:DespatchSupplierParty"] = DespatchSupplierParty;
        this["cac:DeliveryCustomerParty"] = DeliveryCustomerParty;
        this["cac:Shipment"] = Shipment;
        this["cac:DespatchLine"] = DespatchLine;
    }
}

class CbcCustomizationIDClass {
    constructor(text) {
        this._text = text;
    }
}

class TextValue {
    constructor(text) {
        this._text = text;
    }
}
// DespatchSupplierParty
function despatchSupplierParty(
    codigo_tipo_documento_identidad,
    numero_documento,
    apellidos_y_nombres_o_razon_social,
    direccion
) {
    class CacDespatchSupplierParty {
        constructor(Party) {
            this["cac:Party"] = Party;
        }
    }
    class CacParty {
        constructor(PartyIdentification, PartyLegalEntity) {
            this["cac:PartyIdentification"] = PartyIdentification;
            this["cac:PartyLegalEntity"] = PartyLegalEntity;
        }
    }
    class CacPartyIdentification {
        constructor(ID) {
            this["cbc:ID"] = ID;
        }
    }
    class CbcID {
        constructor(attributes, text) {
            this._attributes = attributes;
            this._text = text;
        }
    }
    class CbcIDAttributes {
        constructor(schemeID) {
            this.schemeID = schemeID;
        }
    }


    class CacPartyLegalEntity {
        constructor(RegistrationName, RegistrationAddress) {
            this["cbc:RegistrationName"] = RegistrationName;
            this["cac:RegistrationAddress"] = RegistrationAddress;
        }
    }

    class CacRegistrationAddress {
        constructor(AddressLine) {
            this["cac:AddressLine"] = AddressLine;
        }
    }

    class CacAddressLine {
        constructor(Line) {
            this["cbc:Line"] = Line;
        }
    }

    class TextValue {
        constructor(text) {
            this._text = text;
        }
    }

    const cacParty = new CacParty(
        new CacPartyIdentification(
            new CbcID(new CbcIDAttributes(codigo_tipo_documento_identidad), numero_documento),
        ),
        new CacPartyLegalEntity(
            new TextValue(apellidos_y_nombres_o_razon_social),
            new CacRegistrationAddress(
                new CacAddressLine(
                    new TextValue(direccion)
                )
            )
        )
    )

    return new CacDespatchSupplierParty(cacParty);
}

// DeliveryCustomerParty
function deliveryCustomerParty(
    codigo_tipo_documento_identidad,
    numero_documento,
    apellidos_y_nombres_o_razon_social
) {
    class CacDeliveryCustomerParty {
        constructor(Party) {
            this["cac:Party"] = Party;
        }
    }
    class CacParty {
        constructor(PartyIdentification, PartyLegalEntity) {
            this["cac:PartyIdentification"] = PartyIdentification;
            this["cac:PartyLegalEntity"] = PartyLegalEntity;
        }
    }
    class CacPartyIdentification {
        constructor(ID) {
            this["cbc:ID"] = ID;
        }
    }
    class CbcID {
        constructor(attributes, text) {
            this._attributes = attributes;
            this._text = text;
        }
    }
    class CbcIDAttributes {
        constructor(schemeID) {
            this.schemeID = schemeID;
        }
    }


    class CacPartyLegalEntity {
        constructor(RegistrationName, RegistrationAddress) {
            this["cbc:RegistrationName"] = RegistrationName;
            this["cac:RegistrationAddress"] = RegistrationAddress;
        }
    }
    class TextValue {
        constructor(text) {
            this._text = text;
        }
    }

    return new CacDeliveryCustomerParty(
        new CacParty(
            new CacPartyIdentification(
                new CbcID(new CbcIDAttributes(codigo_tipo_documento_identidad), numero_documento),
            ),
            new CacPartyLegalEntity(
                new TextValue(apellidos_y_nombres_o_razon_social),
            ),
        )
    )
}

// Shipment
function shipment(
    SUNAT_Envio,
    unidad_peso_total,
    peso_total,
    numero_de_bultos,
    fecha_de_traslado,
    mtc_id,
    mtc,
    chofer_codigo_tipo_documento_identidad,
    chofer_numero_documento,
    chofer_nombres,
    chofer_apellidos,
    chofer_numero_licencia,
    partida_ubigeo,
    partida_direccion,
    destinatario_ubigeo,
    destinatario_direccion,
    numero_de_placa,
    tuc,
) {
    class CacShipment {
        constructor(ID, GrossWeightMeasure, ShipmentStage, Delivery, TransportHandlingUnit) {
            this["cbc:ID"] = ID;
            this["cbc:GrossWeightMeasure"] = GrossWeightMeasure;
            this["cac:ShipmentStage"] = ShipmentStage;
            this["cac:Delivery"] = Delivery;
            this["cac:TransportHandlingUnit"] = TransportHandlingUnit;
        }
    }
    class CbcIDShipment {
        constructor(text) {
            this._text = text;
        }
    }
    class CbcGrossWeightMeasureClass {
        constructor(attributes, text) {
            this._attributes = attributes;
            this._text = text;
        }
    }
    class CbcGrossWeightMeasureAttributes {
        constructor(unitCode) {
            this.unitCode = unitCode;
        }
    }
    class CacShipmentStage {
        constructor(TransitPeriod, CarrierParty, DriverPerson) {
            this["cac:TransitPeriod"] = TransitPeriod;
            this["cac:CarrierParty"] = CarrierParty;
            this["cac:DriverPerson"] = DriverPerson;
        }
    }
    class CacTransitPeriod {
        constructor(StartDate) {
            this["cbc:StartDate"] = StartDate;
        }
    }
    class CacCarrierParty {
        constructor(PartyIdentification, PartyLegalEntity) {
            this["cac:PartyIdentification"] = PartyIdentification;
            this["cac:PartyLegalEntity"] = PartyLegalEntity;
        }
    }
    class CacDriverPerson {
        constructor(ID, FirstName, FamilyName, JobTitle, IdentityDocumentReference) {
            this["cbc:ID"] = ID;
            this["cbc:FirstName"] = FirstName;
            this["cbc:FamilyName"] = FamilyName;
            this["cbc:JobTitle"] = JobTitle;
            this["cac:IdentityDocumentReference"] = IdentityDocumentReference;
        }
    }
    class CacDriverPersonCbcID {
        constructor(attributes, text) {
            this._attributes = attributes;
            this._text = text;
        }
    }
    class CbcIDAttributesSchemaID {
        constructor(schemeID) {
            this.schemeID = schemeID;
        }
    }
    class CacIdentityDocumentReference {
        constructor(ID) {
            this["cbc:ID"] = ID;
        }
    }
    class CacCarrierPartyCacPartyLegalEntity {
        constructor(CompanyID) {
            this["cbc:CompanyID"] = CompanyID;
        }
    }
    class TextValue {
        constructor(text) {
            this._text = text;
        }
    }
    class CacDelivery {
        constructor(DeliveryAddress, Despatch) {
            this["cac:DeliveryAddress"] = DeliveryAddress;
            this["cac:Despatch"] = Despatch;
        }
    }
    class CacAddress {
        constructor(ID, AddressLine) {
            this["cbc:ID"] = ID;
            this["cac:AddressLine"] = AddressLine;
        }
    }
    class CacAddressLine {
        constructor(Line) {
            this["cbc:Line"] = Line;
        }
    }
    class CacDespatch {
        constructor(DespatchAddress, DespatchParty) {
            this["cac:DespatchAddress"] = DespatchAddress;
            this["cac:DespatchParty"] = DespatchParty;
        }
    }
    class CacParty {
        constructor(PartyIdentification, PartyLegalEntity) {
            this["cac:PartyIdentification"] = PartyIdentification;
            this["cac:PartyLegalEntity"] = PartyLegalEntity;
        }
    }
    class CacPartyIdentification {
        constructor(ID) {
            this["cbc:ID"] = ID;
        }
    }
    class CbcIDAttributes {
        constructor(attributes, text) {
            this._attributes = attributes;
        }
    }
    class CacPartyLegalEntity {
        constructor(RegistrationName) {
            this["cbc:RegistrationName"] = RegistrationName;
        }
    }
    class CacTransportHandlingUnit {
        constructor(TransportEquipment) {
            this["cac:TransportEquipment"] = TransportEquipment;
        }
    }
    class CacTransportEquipment {
        constructor(ID, ApplicableTransportMeans) {
            this["cbc:ID"] = ID;
            this["cac:ApplicableTransportMeans"] = ApplicableTransportMeans;
        }
    }
    class CacApplicableTransportMeans {
        constructor(RegistrationNationalityID) {
            this["cbc:RegistrationNationalityID"] = RegistrationNationalityID;
        }
    }
    return new CacShipment(
        new CbcIDShipment(SUNAT_Envio),
        new CbcGrossWeightMeasureClass(new CbcGrossWeightMeasureAttributes(unidad_peso_total), peso_total),
        new CacShipmentStage(
            new CacTransitPeriod(new TextValue(fecha_de_traslado)),
            new CacCarrierParty(
                new CacIdentityDocumentReference(
                    new CbcIDAttributes(new CbcIDAttributesSchemaID(mtc_id))
                ),
                new CacCarrierPartyCacPartyLegalEntity(new TextValue(mtc)),
            ),
            [new CacDriverPerson(
                new CacDriverPersonCbcID(
                    new CbcIDAttributesSchemaID(chofer_codigo_tipo_documento_identidad),
                    chofer_numero_documento
                ),
                new TextValue(chofer_nombres),
                new TextValue(chofer_apellidos),
                new TextValue("Principal"),
                new CacIdentityDocumentReference(new TextValue(chofer_numero_licencia))
            )],
        ),
        new CacDelivery(
            new CacAddress(
                new TextValue(destinatario_ubigeo),
                new CacAddressLine(new TextValue(destinatario_direccion))
            ),
            new CacDespatch(
                new CacAddress(
                    new TextValue(partida_ubigeo),
                    new CacAddressLine(new TextValue(partida_direccion))),
                new CacParty(
                    new CacPartyIdentification(
                        new CacDriverPersonCbcID(new CbcIDAttributesSchemaID("6"), "20600003811")),
                    new CacPartyLegalEntity(new TextValue("EMPRESA DE TRANSPORTES Y NEGOCIOS CARRANZA E.I.R.L."))
                )
            )
        ),
        new CacTransportHandlingUnit(
            new CacTransportEquipment(
                new TextValue(numero_de_placa),
                new CacApplicableTransportMeans(new TextValue(tuc))
            )
        )
    )
}

// Delivery
function despatchLine(index, codigo_interno, cantidad, descripcion) {
    class CacDespatchLine {
        constructor(ID, DeliveredQuantity, OrderLineReference, Item) {
            this["cbc:ID"] = ID;
            this["cbc:DeliveredQuantity"] = DeliveredQuantity;
            this["cac:OrderLineReference"] = OrderLineReference;
            this["cac:Item"] = Item;
        }
    }
    class CbcIDAttributes {
        constructor(attributes, text) {
            this._attributes = attributes;
            this._text = text;
        }
    }
    class CbcDeliveredQuantity {
        constructor(unitCode) {
            this.unitCode = unitCode;
        }
    }
    class CacOrderLineReference {
        constructor(LineID) {
            this["cbc:LineID"] = LineID;
        }
    }
    class CacItem {
        constructor(Description) {
            this["cbc:Description"] = Description;
        }
    }

    class TextValue {
        constructor(text) {
            this._text = text;
        }
    }

    class CbcID {
        constructor(ID) {
            this["cbc:ID"] = ID;
        }
    }
    return new CacDespatchLine(
        new TextValue(index),
        new CbcIDAttributes(new CbcDeliveredQuantity("NIU"), cantidad),
        new CacOrderLineReference(new TextValue(index)),
        new CacItem(new TextValue(descripcion))
    )
}

module.exports = {
    GuiaTransportista,
    DocumentBody,
    despatchSupplierParty,
    shipment,
    despatchLine,
    deliveryCustomerParty,
    TextValue,
    CbcCustomizationIDClass
};