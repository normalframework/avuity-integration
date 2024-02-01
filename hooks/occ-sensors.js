const NormalSdk = require("@normalframework/applications-sdk");
const { InvokeSuccess, InvokeError } = NormalSdk;
const { v5: uuidv5 } = require("uuid");

AVUITY_ENDPOINT = "";
const EQUIP_NAMESPACE = "acc5ab09-a5ad-4bc0-8b2c-3d5cabc253fb";
const EQUIP_TYPE_ID = "ccc53d56-bc69-11ee-af99-5b86660b5caf"
let http;

/**
 * Invoke hook function
 * @param {NormalSdk.InvokeParams} params
 * @returns {NormalSdk.InvokeResult}
 */
module.exports = async ({ sdk, config }) => {
  AVUITY_ENDPOINT = config.avuityApiUrl;
  http = sdk.http;
  const avuityData = await getAvuityData();

  try {
    await ensureEntityTypeCreated();
    await ensureSensorsCreatedAndTagged(avuityData);
    await updateValues(avuityData);
    return InvokeSuccess("Records updated");
  } catch (e) {
    sdk.logEvent(e.message);
    console.log(e);
    return InvokeError(e.message);
  }
};

const ensureEntityTypeCreated = async () => {
  await http.post("/api/v1/equipment/types", {
    equipmentType: {
      name: "Avuity Occupancy Sensor",
      className: "occupancySensor",
      id: EQUIP_TYPE_ID,
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
  }).catch(handleAlreadyExistsResponse);

  entityTypeInitialized = true;
};


const ensureSensorsCreatedAndTagged = async (avuityResponse) => {
  for await (const key of Object.keys(avuityResponse.items)) {
    const current = avuityResponse.items[key];
    const localBacnetObjects = await createLocalBacnetObjects(current);
    await createEquipForSensor(current, localBacnetObjects);
    await tagLocalBacnetObjects(current, localBacnetObjects);
  }
};

const updateValues = async (avuityResponse) => {
  for await (const key of Object.keys(avuityResponse.items)) {
    const responseItem = avuityResponse.items[key];
    await updateSensorValues(responseItem);
  }
};

const updateSensorValues = async (item) => {
  if (item.occpuancy !== null) {
    await http.patch("/api/v1/bacnet/local", {
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
    await http.patch("/api/v1/bacnet/local", {
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
    await http.patch("/api/v1/bacnet/local", {
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

const createEquipForSensor = async (sensor) => {
  const result = await http.post("/api/v1/point/points", {
    points: [
      {
        uuid: uuidv5(sensor.areaName + ".equip", EQUIP_NAMESPACE),
        layer: "model",
        point_type: 4,
        name: sensor.areaName,
        attrs: {
          equipTypeId: EQUIP_TYPE_ID,
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

const tagLocalBacnetObjects = async (sensor) => {
  await http.post("/api/v1/point/points", {
    points: [
      {
        uuid: uuidv5(sensor.areaName + ".occupancy", EQUIP_NAMESPACE),
        layer: "model",
        attrs: {
          equipTypeId: EQUIP_TYPE_ID,
          equipRef: sensor.areaName,
          class: "occupancy-sensor",
          markers: "occupancy,sensor,point",
        },
      },
      {
        uuid: uuidv5(sensor.areaName + ".occupancy", EQUIP_NAMESPACE),
        layer: "avuity",
        name: sensor.areaName + " Occupancy",
        point_type: "POINT",
        attrs: {
          capacity: String(sensor.capacity),
          area_name: sensor.areaName.replaceAll(",", " "),
          floor_name: sensor.floorName.replaceAll(",", " "),
          building_name: sensor.buildingName.replaceAll(",", " "),
          location_name: sensor.locationName.replaceAll(",", " "),
        },
      },
      {
        uuid: uuidv5(sensor.areaName + ".temperature", EQUIP_NAMESPACE),
        layer: "model",
        attrs: {
          equipTypeId: EQUIP_TYPE_ID,
          equipRef: sensor.areaName,
          class: "temperature-sensor",
          markers: "temp,sensor,point",
        },
      },
      {
        uuid: uuidv5(sensor.areaName + ".temperature", EQUIP_NAMESPACE),
        layer: "avuity",
        name: sensor.areaName + " Temperature",
        type: "POINT",
        attrs: {
          capacity: String(sensor.capacity),
          area_name: sensor.areaName.replaceAll(",", " "),
          floor_name: sensor.floorName.replaceAll(",", " "),
          building_name: sensor.buildingName.replaceAll(",", " "),
          location_name: sensor.locationName.replaceAll(",", " "),
        },
      },
      {
        uuid: uuidv5(sensor.areaName + ".humidity", EQUIP_NAMESPACE),
        layer: "model",
        attrs: {
          equipTypeId: EQUIP_TYPE_ID,
          equipRef: sensor.areaName,
          class: "humidity-sensor",
          markers: "humidity,sensor,point",
        },
      },
      {
        uuid: uuidv5(sensor.areaName + ".humidity", EQUIP_NAMESPACE),
        layer: "avuity",
        name: sensor.areaName + " Humidity",
        type: "POINT",
        attrs: {
          capacity: String(sensor.capacity),
          area_name: sensor.areaName.replaceAll(",", " "),
          floor_name: sensor.floorName.replaceAll(",", " "),
          building_name: sensor.buildingName.replaceAll(",", " "),
          location_name: sensor.locationName.replaceAll(",", " "),
        },
      },
    ],
  });
};

const getLocalBacnetObjects = async () => {
  const { data } = await http.get("/api/v1/bacnet/local");
  return data.objects;
};

const createLocalBacnetObjects = async (area) => {
  await http.post("/api/v1/bacnet/local", {
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
  }).catch(handleAlreadyExistsResponse);

  await http.post("/api/v1/bacnet/local", {
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
      },
    ],
  }).catch(handleAlreadyExistsResponse);
  await http.post("/api/v1/bacnet/local", {
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
      },
    ],
  }).catch(handleAlreadyExistsResponse);
};

const handleAlreadyExistsResponse = (e) => {
  if (e.status === 409) {
    return;
  };
  throw e;
}

const getAvuityData = async () => {
  const response = await http.get(AVUITY_ENDPOINT);
  return response.data;
};