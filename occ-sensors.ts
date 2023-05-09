import {
  InvokeFn,
  AxiosInstance,
  InvokeSuccess,
  InvokeError,
  axios,
} from "@normalframework/applications-sdk";
import { v4 as uuid } from "uuid";

let entityTypeInitialized = false;

const avuity: InvokeFn = async (points, sdk) => {
  const avuityData = await getAvuityData();
  try {
    await ensureEntityTypeCreated(sdk.http);
    await ensureSensorsCreatedAndTagged(sdk.http, avuityData);
    await updateValues(sdk.http, avuityData);
    return InvokeSuccess("All done");
  } catch (e: any) {
    sdk.event(e.message);
    return InvokeError(e.message);
  }
};

module.exports = avuity;

const ensureEntityTypeCreated = async (axios: AxiosInstance) => {
  if (entityTypeInitialized) return;
  try {
    const res = await axios.post("/api/v1/ontology/types", {
      entityType: {
        id: "OCCS#occs-1",
        name: "Occupancy Sensor",
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

const ensureSensorsCreatedAndTagged = async (
  axios: AxiosInstance,
  avuityResponse: any
) => {
  let existingSensors = await getBacnetSensors(axios);

  for await (const key of Object.keys(avuityResponse.items)) {
    const current = avuityResponse.items[key];
    if (
      !existingSensors.find(
        (s: any) => s.attrs.prop_object_name === current.areaName
      )
    ) {
      const localBacnetObject = await createLocalBacnetObject(axios, current);
      await createEquipForSensor(axios, current);
      await tagLocalBacnetObject(axios, current, localBacnetObject.uuid);
    } else {
      console.log(`Local Objecty for: ${current.areaName} already created`);
    }
  }
};

const updateValues = async (axios: AxiosInstance, avuityResponse: any) => {
  let existingSensors = await getBacnetSensors(axios);

  for await (const key of Object.keys(avuityResponse.items)) {
    const responseItem = avuityResponse.items[key];
    const currentBacnet = existingSensors.find(
      (s: any) => s.attrs.prop_object_name === responseItem.areaName
    );
    await updateSensorValue(axios, currentBacnet.uuid, responseItem.occupancy);
  }
};

const updateSensorValue = async (
  normalHttp: AxiosInstance,
  uuid: string,
  value: number
) => {
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
};

const createEquipForSensor = async (normalHttp: AxiosInstance, sensor: any) => {
  const result = await normalHttp.post("/api/v1/point/points", {
    points: [
      {
        uuid: uuid(),
        layer: "model",
        attrs: {
          type: "Occupancy Sensor",
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
  // const sensorsOnBacnet = await getBacnetSensors(normalHttp);
  // const bacnetSensor = sensorsOnBacnet.find(
  //   (e: any) => e.attrs.prop_object_name === sensor.areaName
  // );

  // if (!bacnetSensor) return;

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

const getBacnetSensors = async (normalHttp: AxiosInstance) => {
  // TODO: this is not a reliable way to get this data
  const { data } = await normalHttp.get(
    "/api/v1/point/points?layer=hpl:bacnet:1&responseFormat=0&pageOffset=0&pageSize=100&structuredQuery.field.property=device_prop_object_name&structuredQuery.field.text=NF"
  );
  return data.points;
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
  return response.data;
};

const getAvuityData = async () => {
  const { data } = await axios.get(
    "https://avuityoffice.avuity.com/VuSpace/api/real-time-occupancy/get-by-floor?buildingName=Avuity%20Office&floorName=Suite%20510&access-token=a4cGtYcRPdpwANr6"
  );
  return data;
};
