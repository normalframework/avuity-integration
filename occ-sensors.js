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
const avuity = (points, sdk) => __awaiter(void 0, void 0, void 0, function* () {
    const avuityData = yield getAvuityData();
    try {
        yield ensureEntityTypeCreated(sdk.http);
        yield ensureSensorsCreatedAndTagged(sdk.http, avuityData, sdk.event);
        yield updateValues(sdk.http, avuityData);
        return (0, applications_sdk_1.InvokeSuccess)("All done");
    }
    catch (e) {
        sdk.event(e.message);
        return (0, applications_sdk_1.InvokeError)(e.message);
    }
});
module.exports = avuity;
const ensureEntityTypeCreated = (axios) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield axios.post("/api/v1/ontology/types", {
            entityType: {
                id: "OCCS#occs-1",
                name: "OCCS (2)",
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
        console.log(e.response);
        if (e.response.status !== 409) {
            throw e;
        }
    }
});
const ensureSensorsCreatedAndTagged = (axios, avuityResponse, event) => __awaiter(void 0, void 0, void 0, function* () {
    // event("tagging sensors");
    var _a, e_1, _b, _c;
    let existingSensors = yield getBacnetSensors(axios);
    try {
        for (var _d = true, _e = __asyncValues(Object.keys(avuityResponse.items)), _f; _f = yield _e.next(), _a = _f.done, !_a;) {
            _c = _f.value;
            _d = false;
            try {
                const key = _c;
                const current = avuityResponse.items[key];
                if (!existingSensors.find((s) => s.attrs.prop_object_name === current.areaName)) {
                    // event("did not find" + current.areaName);
                    yield createLocalBacnetObject(axios, current);
                    yield createEquipForSensor(axios, current);
                    yield tagLocalBacnetObject(axios, current);
                }
                else {
                    console.log("!!! No update needed for ", current.areaName);
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
    let existingSensors = yield getBacnetSensors(axios);
    try {
        for (var _k = true, _l = __asyncValues(Object.keys(avuityResponse.items)), _m; _m = yield _l.next(), _g = _m.done, !_g;) {
            _j = _m.value;
            _k = false;
            try {
                const key = _j;
                const responseItem = avuityResponse.items[key];
                const currentBacnet = existingSensors.find((s) => s.attrs.prop_object_name === responseItem.areaName);
                yield updateSensorValue(axios, currentBacnet.uuid, responseItem.occupancy);
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
const updateSensorValue = (normalHttp, uuid, value) => __awaiter(void 0, void 0, void 0, function* () {
    normalHttp.post("/api/v1/point/data", {
        layer: "hpl:bacnet:1",
        uuid,
        values: [
            {
                ts: new Date().toISOString(),
                unsigned: value,
            },
        ],
    });
});
const createEquipForSensor = (normalHttp, sensor) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield normalHttp.post("/api/v1/point/points", {
        points: [
            {
                uuid: (0, uuid_1.v4)(),
                layer: "model",
                attrs: {
                    type: "OCCS (2)",
                    dataLayer: "hpl:bacnet:1",
                    id: sensor.areaName,
                    markers: "device,environment,occupancy,sensor",
                    class: "OCCS",
                },
            },
        ],
    });
});
const tagLocalBacnetObject = (normalHttp, sensor) => __awaiter(void 0, void 0, void 0, function* () {
    const sensorsOnBacnet = yield getBacnetSensors(normalHttp);
    const bacnetSensor = sensorsOnBacnet.find((e) => e.attrs.prop_object_name === sensor.areaName);
    if (!bacnetSensor)
        return;
    yield normalHttp.post("/api/v1/point/points", {
        points: [
            {
                uuid: bacnetSensor.uuid,
                layer: "model",
                attrs: {
                    equipRef: sensor.areaName,
                    class: "OCCSNS",
                },
            },
        ],
    });
});
const getBacnetSensors = (normalHttp) => __awaiter(void 0, void 0, void 0, function* () {
    const { data } = yield normalHttp.get("/api/v1/point/points?layer=hpl:bacnet:1&responseFormat=0&pageOffset=0&pageSize=100&structuredQuery.field.property=device_prop_object_name&structuredQuery.field.text=NF");
    return data.points;
});
const createLocalBacnetObject = (normalHttp, area) => __awaiter(void 0, void 0, void 0, function* () {
    yield normalHttp.post("/api/v1/bacnet/local", {
        objectId: {
            instance: 0,
            objectType: "OBJECT_ANALOG_VALUE",
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
                property: "PROP_OCCUPANCY_UPPER_LIMIT",
                value: {
                    unsigned: area.capacity,
                },
            },
        ],
    });
});
const getAvuityData = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("######## Starting to fetch avuity data");
    const { data } = yield applications_sdk_1.axios.get("https://avuityoffice.avuity.com/VuSpace/api/real-time-occupancy/get-by-floor?buildingName=Avuity%20Office&floorName=Suite%20510&access-token=a4cGtYcRPdpwANr6");
    console.log("######## Done Fetching avuity data");
    return data;
    // https://avuityoffice.avuity.com/VuSpace/api/real-time-occupancy/get-by-floor?buildingName=Avuity%20Office&floorName=Suite%20510&access-token=a4cGtYcRPdpwANr6
});
// const avuityResponse: any = {
//   statusCode: 200,
//   message: "Success",
//   items: {
//     Andrew: {
//       occupancy: 0,
//       areaName: "Andrew",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "Brad M": {
//       occupancy: 0,
//       areaName: "Brad M",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "Brad's Office": {
//       occupancy: 0,
//       areaName: "Brad's Office",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     David: {
//       occupancy: 1,
//       areaName: "David",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     Ed: {
//       occupancy: 1,
//       areaName: "Ed",
//       capacity: 2,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "Jay's Office": {
//       occupancy: 1,
//       areaName: "Jay's Office",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     Jenny: {
//       occupancy: 0,
//       areaName: "Jenny",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     Kitchen: {
//       occupancy: 1,
//       areaName: "Kitchen",
//       capacity: 4,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     Lindsey: {
//       occupancy: 0,
//       areaName: "Lindsey",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "Mini Lab": {
//       occupancy: 0,
//       areaName: "Mini Lab",
//       capacity: 2,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     Nicole: {
//       occupancy: 1,
//       areaName: "Nicole",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "Pod 2": {
//       occupancy: 0,
//       areaName: "Pod 2",
//       capacity: 3,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "Pod 3": {
//       occupancy: 0,
//       areaName: "Pod 3",
//       capacity: 4,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "Rachel ": {
//       occupancy: 1,
//       areaName: "Rachel ",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     Sayuz: {
//       occupancy: 0,
//       areaName: "Sayuz",
//       capacity: 1,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "The Bridge": {
//       occupancy: 0,
//       areaName: "The Bridge",
//       capacity: 2,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "The Death Star": {
//       occupancy: 0,
//       areaName: "The Death Star",
//       capacity: 12,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "The Garage": {
//       occupancy: 0,
//       areaName: "The Garage",
//       capacity: 12,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//     "The Thunderdome": {
//       occupancy: 0,
//       areaName: "The Thunderdome",
//       capacity: 8,
//       floorName: "Suite 510",
//       buildingName: "Avuity Office ",
//       locationName: "Avuity Office",
//     },
//   },
// };
//# sourceMappingURL=occ-sensors.js.map