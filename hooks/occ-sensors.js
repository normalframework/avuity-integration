const NormalSdk = require("@normalframework/applications-sdk");
const { InvokeSuccess, InvokeError } = NormalSdk;
const { v5: uuidv5 } = require("uuid");

AVUITY_ENDPOINT =
  "https://avuityoffice.avuity.com/VuSpace/api/real-time-occupancy/get-by-floor?buildingName=Avuity%20Office&floorName=Suite%20510&access-token=a4cGtYcRPdpwANr6";
let entityTypeInitialized = false;
const EQUIP_NAMESPACE = "acc5ab09-a5ad-4bc0-8b2c-3d5cabc253fb";

/**
 * Invoke hook function
 * @param {NormalSdk.InvokeParams} params
 * @returns {NormalSdk.InvokeResult}
 */
module.exports = async ({ sdk }) => {
  const avuityData = await getAvuityData(sdk.http);

  try {
    await ensureEntityTypeCreated(sdk.http);
    await ensureSensorsCreatedAndTagged(sdk.http, avuityData);
    await updateValues(sdk.http, avuityData);
    return InvokeSuccess("Records updated");
  } catch (e) {
    sdk.event(e.message);
    console.error(e.message);
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
    const nameProp = s.props.find((p) => p.property === "PROP_OBJECT_NAME");
    return nameProp?.value?.characterString === name;
  });
};

const ensureSensorsCreatedAndTagged = async (axios, avuityResponse) => {
  let existingSensors = await getLocalBacnetObjects(axios);

  for await (const key of Object.keys(avuityResponse.items)) {
    const current = avuityResponse.items[key];
    if (!selectSensor(existingSensors, current.areaName)) {
      const localBacnetObject = await createLocalBacnetObject(axios, current);
      await createEquipForSensor(axios, current, localBacnetObject.uuid);
      await tagLocalBacnetObject(axios, current, localBacnetObject.uuid);
    } else {
      console.log(`Local Object for: ${current.areaName} already created`);
    }
  }
};

const updateValues = async (axios, avuityResponse) => {
  let existingSensors = await getLocalBacnetObjects(axios);

  for await (const key of Object.keys(avuityResponse.items)) {
    const responseItem = avuityResponse.items[key];
    const sensorPoint = selectSensor(existingSensors, responseItem.areaName);

    await updateSensorValue(
      axios,
      sensorPoint.objectId,
      responseItem.occupancy
    );
  }
};

const updateSensorValue = async (normalHttp, objectId, value) => {
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
};

const createEquipForSensor = async (normalHttp, sensor, sensorUUID) => {
  const result = await normalHttp.post("/api/v1/point/points", {
    points: [
      {
        // will always be the same for a given sensorUUID. See: https://stackoverflow.com/questions/10867405/generating-v5-uuid-what-is-name-and-namespace
        uuid: uuidv5(sensorUUID, EQUIP_NAMESPACE),
        layer: "model",
        attrs: {
          type: "Avuity Occupancy Sensor",
          dataLayer: "hpl:bacnet:1",
          id: sensor.areaName,
          markers: "occupancy,sensor,point",
          class: "occupancySensor#avuity",
        },
      },
    ],
  });
};

const tagLocalBacnetObject = async (normalHttp, sensor, uuid) => {
  await normalHttp.post("/api/v1/point/points", {
    points: [
      {
        uuid,
        layer: "model",
        attrs: {
          equipRef: sensor.areaName,
          class: "occupancy-sensor",
          markers: "occupancy,sensor,point",

        },
      },
    ],
  });
};

const getLocalBacnetObjects = async (normalHttp) => {
  const { data } = await normalHttp.get("/api/v1/bacnet/local");
  return data.objects;
};

const createLocalBacnetObject = async (normalHttp, area) => {
  const response = await normalHttp.post("/api/v1/bacnet/local", {
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
};

const getAvuityData = async (axios) => {
  const response = await axios.get(AVUITY_ENDPOINT);
  return response.data;
};
