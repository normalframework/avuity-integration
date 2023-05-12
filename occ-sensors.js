"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const applications_sdk_1 = require("@normalframework/applications-sdk");
const uuid_1 = require("uuid");
let entityTypeInitialized = false;
const EQUIP_NAMESPACE = "acc5ab09-a5ad-4bc0-8b2c-3d5cabc253fb";
const avuity = (points, sdk) => __awaiter(void 0, void 0, void 0, function* () {
    const avuityData = yield getAvuityData();
    try {
        yield ensureEntityTypeCreated(sdk.http);
        yield ensureSensorsCreatedAndTagged(sdk.http, avuityData);
        yield updateValues(sdk.http, avuityData);
        return (0, applications_sdk_1.InvokeSuccess)("All done");
    }
    catch (e) {
        sdk.event(e.message);
        console.error(e.message);
        return (0, applications_sdk_1.InvokeError)(e.message);
    }
});
module.exports = avuity;
const ensureEntityTypeCreated = (axios) => __awaiter(void 0, void 0, void 0, function* () {
    if (entityTypeInitialized)
        return;
    try {
        const res = yield axios.post("/api/v1/ontology/types", {
            entityType: {
                name: "Avuity Occupancy Sensor",
                className: "OCCS",
                description: "Any device that senses or detects the occupancy information within a space.",
                markers: [
                    {
                        name: "device",
                        description: "Microprocessor based hardware device",
                        ontologyRequires: true,
                        typeRequires: false,
                    },
                    {
                        name: "environment",
                        description: "Encompassing all aspects of a defined area (air, lighting, acoustic, etc)",
                        ontologyRequires: true,
                        typeRequires: false,
                    },
                    {
                        name: "occupancy",
                        description: "Number of occupants in a space",
                        ontologyRequires: true,
                        typeRequires: false,
                    },
                    {
                        name: "sensor",
                        description: "Point is a sensor, input, AI/BI",
                        ontologyRequires: true,
                        typeRequires: false,
                    },
                ],
                points: [],
                attributes: [],
                relations: [
                    {
                        name: "siteRef",
                        description: "",
                        defaultValue: "",
                        ontologyRequires: true,
                        typeRequires: false,
                    },
                    {
                        name: "spaceRef",
                        description: "",
                        defaultValue: "",
                        ontologyRequires: true,
                        typeRequires: false,
                    },
                    {
                        name: "networkRef",
                        description: "",
                        defaultValue: "",
                        ontologyRequires: false,
                        typeRequires: false,
                    },
                    {
                        name: "systemRef",
                        description: "",
                        defaultValue: "",
                        ontologyRequires: false,
                        typeRequires: false,
                    },
                    {
                        name: "hvacZoneRef",
                        description: "",
                        defaultValue: "",
                        ontologyRequires: false,
                        typeRequires: false,
                    },
                    {
                        name: "lightingZoneRef",
                        description: "",
                        defaultValue: "",
                        ontologyRequires: false,
                        typeRequires: false,
                    },
                ],
                parents: ["DEV", "OTDEV", "ENVS"],
                hasChildren: true,
                icon: "AccountCircle",
                kind: "EQUIPMENT",
            },
        });
    }
    catch (e) {
        // 409 expected if we have already created the entity type
        if (e.response.status !== 409) {
            throw e;
        }
    }
    entityTypeInitialized = true;
});
const selectSensor = (localBacnetObjects, name) => {
    return localBacnetObjects === null || localBacnetObjects === void 0 ? void 0 : localBacnetObjects.find((s) => {
        var _a;
        const nameProp = s.props.find((p) => p.property === "PROP_OBJECT_NAME");
        return ((_a = nameProp === null || nameProp === void 0 ? void 0 : nameProp.value) === null || _a === void 0 ? void 0 : _a.characterString) === name;
    });
};
const ensureSensorsCreatedAndTagged = (axios, avuityResponse) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    let existingSensors = yield getLocalBacnetObjects(axios);
    try {
        for (var _d = true, _e = __asyncValues(Object.keys(avuityResponse.items)), _f; _f = yield _e.next(), _a = _f.done, !_a;) {
            _c = _f.value;
            _d = false;
            try {
                const key = _c;
                const current = avuityResponse.items[key];
                if (!selectSensor(existingSensors, current.areaName)) {
                    const localBacnetObject = yield createLocalBacnetObject(axios, current);
                    yield createEquipForSensor(axios, current, localBacnetObject.uuid);
                    yield tagLocalBacnetObject(axios, current, localBacnetObject.uuid);
                }
                else {
                    console.log(`Local Objecty for: ${current.areaName} already created`);
                }
            }
            finally {
                _d = true;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
        }
        finally { if (e_1) throw e_1.error; }
    }
});
const updateValues = (axios, avuityResponse) => __awaiter(void 0, void 0, void 0, function* () {
    var _g, e_2, _h, _j;
    let existingSensors = yield getLocalBacnetObjects(axios);
    try {
        for (var _k = true, _l = __asyncValues(Object.keys(avuityResponse.items)), _m; _m = yield _l.next(), _g = _m.done, !_g;) {
            _j = _m.value;
            _k = false;
            try {
                const key = _j;
                const responseItem = avuityResponse.items[key];
                const sensorPoint = selectSensor(existingSensors, responseItem.areaName);
                yield updateSensorValue(axios, sensorPoint.objectId, responseItem.occupancy);
            }
            finally {
                _k = true;
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (!_k && !_g && (_h = _l.return)) yield _h.call(_l);
        }
        finally { if (e_2) throw e_2.error; }
    }
});
const updateSensorValue = (normalHttp, objectId, value) => __awaiter(void 0, void 0, void 0, function* () {
    normalHttp.patch("/api/v1/bacnet/local", {
        objectId,
        props: [
            {
                property: "PROP_PRESENT_VALUE",
                value: {
                    real: value,
                },
            },
        ],
    });
});
const createEquipForSensor = (normalHttp, sensor, sensorUUID) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield normalHttp.post("/api/v1/point/points", {
        points: [
            {
                // will always be the same for a given sensorUUID. See: https://stackoverflow.com/questions/10867405/generating-v5-uuid-what-is-name-and-namespace
                uuid: (0, uuid_1.v5)(sensorUUID, EQUIP_NAMESPACE),
                layer: "model",
                attrs: {
                    type: "Avuity Occupancy Sensor",
                    dataLayer: "hpl:bacnet:1",
                    id: sensor.areaName,
                    markers: "device,environment,occupancy,sensor",
                    class: "OCCS",
                },
            },
        ],
    });
});
const tagLocalBacnetObject = (normalHttp, sensor, uuid) => __awaiter(void 0, void 0, void 0, function* () {
    yield normalHttp.post("/api/v1/point/points", {
        points: [
            {
                uuid,
                layer: "model",
                attrs: {
                    equipRef: sensor.areaName,
                    class: "OCCSNS",
                },
            },
        ],
    });
});
const getLocalBacnetObjects = (normalHttp) => __awaiter(void 0, void 0, void 0, function* () {
    const { data } = yield normalHttp.get("/api/v1/bacnet/local");
    return data.objects;
});
const createLocalBacnetObject = (normalHttp, area) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield normalHttp.post("/api/v1/bacnet/local", {
        objectId: {
            instance: 0,
            objectType: "OBJECT_ANALOG_INPUT",
        },
        props: [
            {
                property: "PROP_UNITS",
                value: {
                    enumerated: 95,
                },
            },
            {
                property: "PROP_OBJECT_NAME",
                value: {
                    characterString: area.areaName,
                },
            },
            {
                property: "PROP_DESCRIPTION",
                value: {
                    characterString: "Occupation Sensor",
                },
            },
            {
                property: "PROP_MAX_PRES_VALUE",
                value: {
                    real: area.capacity,
                },
            },
        ],
    });
    return response.data;
});
const getAvuityData = () => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield applications_sdk_1.axios.get("https://avuityoffice.avuity.com/VuSpace/api/real-time-occupancy/get-by-floor?buildingName=Avuity%20Office&floorName=Suite%20510&access-token=a4cGtYcRPdpwANr6");
    return response.data;
});
//# sourceMappingURL=occ-sensors.js.map