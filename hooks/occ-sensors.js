const NormalSdk = require("@normalframework/applications-sdk");
const { InvokeSuccess, InvokeError } = NormalSdk;
const { v5: uuidv5 } = require("uuid"); 
 
AVUITY_ENDPOINT = ""
let entityTypeInitialized = false;
const EQUIP_NAMESPACE = "acc5ab09-a5ad-4bc0-8b2c-3d5cabc253fb";

/**
 * Invoke hook function
 * @param {NormalSdk.InvokeParams} params
 * @returns {NormalSdk.InvokeResult} 
 */
module.exports = async ({ sdk, points, config }) => {
  if (AVUITY_ENDPOINT === "") {
    AVUITY_ENDPOINT = config["Avuity API URL"].valueType.string
  }
  if (AVUITY_ENDPOINT === "") {
    console.log("Unconfigured: Set Avuity API URL in config")
    return InvokeError("Unconfigured API URL")
  }
  const avuityData = await getAvuityData(sdk.http);

  try {
    await ensureEntityTypeCreated(sdk.http);
    await ensureSensorsCreatedAndTagged(sdk.http, avuityData);
    await updateValues(sdk.http, avuityData);
    return InvokeSuccess("Records updated");
  } catch (e) {
    sdk.event(e.message);
    console.error(e.message, ": ", e.response.headers["grpc-message"]);
    return InvokeError(e.message);
  }
};

const ensureEntityTypeCreated = async (axios) => {
  if (entityTypeInitialized) return;
  try {
    await axios.post("/api/v1/ontology/types", {
      entityType: {
        name: "Avuity Occupancy Sensor",
        className: "occupancySensor",
        description:
          "Any device that senses or detects the occupancy information within a space.",
        markers: [
          {
            name: "occupancySensor",
            ontologyRequires: true,
            typeRequires: false,
          },
          {
            name: "equip",
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
            name: "systemRef",
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
  } catch (e) {
    // 409 expected if we have already created the entity type
    if (e.response.status !== 409) {
      throw e;
    }
  }
  entityTypeInitialized = true;
};

const selectSensor = (localBacnetObjects, name) => {
  return localBacnetObjects?.find((s) => {
    return s.uuid === uuidv5(name + ".occupancy", EQUIP_NAMESPACE)
  });
};

const ensureSensorsCreatedAndTagged = async (axios, avuityResponse) => {
  let existingSensors = await getLocalBacnetObjects(axios);

  for await (const key of Object.keys(avuityResponse.items)) {
    const current = avuityResponse.items[key];
    if (!selectSensor(existingSensors, current.areaName)) {
      const localBacnetObjects = await createLocalBacnetObjects(axios, current);
      await createEquipForSensor(axios, current, localBacnetObjects);
      await tagLocalBacnetObjects(axios, current, localBacnetObjects);
    } else {
      console.log(`Local Object for: ${current.areaName} already created`);
    }
  }
};

const updateValues = async (axios, avuityResponse) => {
  for await (const key of Object.keys(avuityResponse.items)) {
    const responseItem = avuityResponse.items[key];
    await updateSensorValues(
      axios,
      responseItem,
    );
  }
};

const updateSensorValues = async (normalHttp, item) => {

  if (item.occpuancy !== null) {
    normalHttp.patch("/api/v1/bacnet/local", {
      uuid: uuidv5(item.areaName + ".occupancy", EQUIP_NAMESPACE),
      props: [
        {
          property: "PROP_PRESENT_VALUE",
          value: {
            real: item.occupancy,
          },
        },
      ],
    });
  }
  if (item.temperature !== null) {
    normalHttp.patch("/api/v1/bacnet/local", {
      uuid: uuidv5(item.areaName + ".temperature", EQUIP_NAMESPACE),
      props: [
        {
          property: "PROP_PRESENT_VALUE",
          value: {
            real: item.temperature,
          },
        },
       ],
    });
  }
  if (item.humidity !== null) { 
    normalHttp.patch("/api/v1/bacnet/local", {
      uuid: uuidv5(item.areaName + ".humidity", EQUIP_NAMESPACE),
      props: [
        {
          property: "PROP_PRESENT_VALUE",
          value: {
            real: item.humidity,
          },
        },
      ],
  });
  }
};

const createEquipForSensor = async (normalHttp, sensor) => {
  const result = await normalHttp.post("/api/v1/point/points", {
    points: [
      {
        // will always be the same for a given sensorUUID. See: https://stackoverflow.com/questions/10867405/generating-v5-uuid-what-is-name-and-namespace
        uuid: uuidv5(sensor.areaName + ".equip", EQUIP_NAMESPACE),
        layer: "model",
        attrs: {
          type: "Avuity Occupancy Sensor",
          dataLayer: "avuity",
          id: sensor.areaName,
          markers: "occupancySensor,equip",
          class: "occupancySensor",
        },
      },
    ],
  });
};

const tagLocalBacnetObjects = async (normalHttp, sensor) => {
  await normalHttp.post("/api/v1/point/points", {
    points: [
      {
        uuid: uuidv5(sensor.areaName + ".occupancy", EQUIP_NAMESPACE),
        layer: "model",
        attrs: {
          equipRef: sensor.areaName,
          class: "occupancy-sensor",
          markers: "occupancy,sensor,point",
        },
      },
      {
        uuid: uuidv5(sensor.areaName + ".occupancy", EQUIP_NAMESPACE),
        layer: "avuity",
        attrs: {
          "capacity": String(sensor.capacity),
          "area_name": sensor.areaName,
          "floor_name": sensor.floorName,
          "building_name": sensor.buildingName,
          "location_name": sensor.locationName,
        }
      },
     {
        uuid: uuidv5(sensor.areaName + ".temperature", EQUIP_NAMESPACE),
        layer: "model",
        attrs: {
          equipRef: sensor.areaName,
          class: "temperature-sensor",
          markers: "temp,sensor,point",
        },
      },
      {
        uuid: uuidv5(sensor.areaName + ".temperature", EQUIP_NAMESPACE),
        layer: "avuity",
        attrs: {
          "capacity": String(sensor.capacity),
          "area_name": sensor.areaName,
          "floor_name": sensor.floorName,
          "building_name": sensor.buildingName,
          "location_name": sensor.locationName,
        }
      },
      {
        uuid: uuidv5(sensor.areaName + ".humidity", EQUIP_NAMESPACE),
        layer: "model",
        attrs: {
          equipRef: sensor.areaName,
          class: "humidity-sensor",
          markers: "humidity,sensor,point",
        },
      },
      {
        uuid: uuidv5(sensor.areaName + ".humidity", EQUIP_NAMESPACE),
        layer: "avuity",
        attrs: {
          "capacity": String(sensor.capacity),
          "area_name": sensor.areaName,
          "floor_name": sensor.floorName,
          "building_name": sensor.buildingName,
          "location_name": sensor.locationName,
        }
      }
    ],
  });
};

const getLocalBacnetObjects = async (normalHttp) => {
  const { data } = await normalHttp.get("/api/v1/bacnet/local");
  return data.objects;
};

const createLocalBacnetObjects = async (normalHttp, area) => {
  var local_objects = {
    "occupancy": undefined,
    "temperature": undefined,
    "humidity": undefined,
  }
  var response = await normalHttp.post("/api/v1/bacnet/local", {
    uuid: uuidv5(area.areaName + ".occupancy", EQUIP_NAMESPACE),
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
          characterString: area.areaName + " Occupancy",
        },
      },
      {
        property: "PROP_DESCRIPTION",
        value: {
          characterString: "Occupancy Sensor",
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
  local_objects.occupancy = response.data;
  response = await normalHttp.post("/api/v1/bacnet/local", {
    uuid: uuidv5(area.areaName + ".humidity", EQUIP_NAMESPACE),
    objectId: {
      instance: 0,
      objectType: "OBJECT_ANALOG_INPUT",
    },
    props: [
      {
        property: "PROP_UNITS",
        value: {
          enumerated: 29,
        },
      },
      {
        property: "PROP_OBJECT_NAME",
        value: {
          characterString: area.areaName + " Humidity",
        },
      },
      {
        property: "PROP_DESCRIPTION",
        value: {
          characterString: "Humidity Sensor",
        },
      }
    ],
  });
  local_objects.humidity = response.data;
  response = await normalHttp.post("/api/v1/bacnet/local", {
    uuid: uuidv5(area.areaName + ".temperature", EQUIP_NAMESPACE),
    objectId: {
      instance: 0,
      objectType: "OBJECT_ANALOG_INPUT",
    },
    props: [
      {
        property: "PROP_UNITS",
        value: {
          enumerated: 62,
        },
      },
      {
        property: "PROP_OBJECT_NAME",
        value: {
          characterString: area.areaName + " Temperature",
        },
      },
      {
        property: "PROP_DESCRIPTION",
        value: {
          characterString: "Temperature Sensor",
        },
      }
    ],
  });
  local_objects.temperature = response.data;
  return response.data;
};

const getAvuityData = async (axios) => {
  const response = await axios.get(AVUITY_ENDPOINT);
  return response.data;
};
