import {
  InvokeFn,
  AxiosInstance,
  InvokeSuccess,
  InvokeError,
  axios,
} from "@normalframework/applications-sdk";
import { v5 as uuidv5 } from "uuid";

let entityTypeInitialized = false;
const EQUIP_NAMESPACE = "acc5ab09-a5ad-4bc0-8b2c-3d5cabc253fb";

const avuity: InvokeFn = async (points, sdk) => {
  const avuityData = await getAvuityData();
  try {
    await ensureEntityTypeCreated(sdk.http);
    await ensureSensorsCreatedAndTagged(sdk.http, avuityData);
    await updateValues(sdk.http, avuityData);
    return InvokeSuccess("All done");
  } catch (e: any) {
    sdk.event(e.message);
    console.error(e.message);
    return InvokeError(e.message);
  }
};

module.exports = avuity;

const ensureEntityTypeCreated = async (axios: AxiosInstance) => {
  if (entityTypeInitialized) return;
  try {
    const res = await axios.post("/api/v1/ontology/types", {
      entityType: {
        name: "Avuity Occupancy Sensor",
        className: "OCCS",
        description:
          "Any device that senses or detects the occupancy information within a space.",
        markers: [
          {
            name: "device",
            description: "Microprocessor based hardware device",
            ontologyRequires: true,
            typeRequires: false,
          },
          {
            name: "environment",
            description:
              "Encompassing all aspects of a defined area (air, lighting, acoustic, etc)",
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
  } catch (e: any) {
    // 409 expected if we have already created the entity type
    if (e.response.status !== 409) {
      throw e;
    }
  }
  entityTypeInitialized = true;
};

const selectSensor = (localBacnetObjects: any[], name: string) => {
  return localBacnetObjects?.find((s: any) => {
    const nameProp = s.props.find(
      (p: any) => p.property === "PROP_OBJECT_NAME"
    );
    return nameProp?.value?.characterString === name;
  });
};

const ensureSensorsCreatedAndTagged = async (
  axios: AxiosInstance,
  avuityResponse: any
) => {
  let existingSensors = await getLocalBacnetObjects(axios);

  for await (const key of Object.keys(avuityResponse.items)) {
    const current = avuityResponse.items[key];
    if (!selectSensor(existingSensors, current.areaName)) {
      const localBacnetObject = await createLocalBacnetObject(axios, current);
      await createEquipForSensor(axios, current, localBacnetObject.uuid);
      await tagLocalBacnetObject(axios, current, localBacnetObject.uuid);
    } else {
      console.log(`Local Objecty for: ${current.areaName} already created`);
    }
  }
};

const updateValues = async (axios: AxiosInstance, avuityResponse: any) => {
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

const updateSensorValue = async (
  normalHttp: AxiosInstance,
  objectId: { objectType: string; instance: number },
  value: number
) => {
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

const createEquipForSensor = async (
  normalHttp: AxiosInstance,
  sensor: any,
  sensorUUID: string
) => {
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
          markers: "device,environment,occupancy,sensor",
          class: "OCCS",
        },
      },
    ],
  });
};

const tagLocalBacnetObject = async (
  normalHttp: AxiosInstance,
  sensor: any,
  uuid: string
) => {
  await normalHttp.post("/api/v1/point/points", {
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
};

const getLocalBacnetObjects = async (normalHttp: AxiosInstance) => {
  const { data } = await normalHttp.get("/api/v1/bacnet/local");
  return data.objects;
};

const createLocalBacnetObject = async (
  normalHttp: AxiosInstance,
  area: any
): Promise<{
  objectId: {
    objectType: string;
    instance: number;
  };
  uuid: string;
}> => {
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

const getAvuityData = async () => {
  const response = await axios.get(
    "https://avuityoffice.avuity.com/VuSpace/api/real-time-occupancy/get-by-floor?buildingName=Avuity%20Office&floorName=Suite%20510&access-token=a4cGtYcRPdpwANr6"
  );
  return response.data;
};
