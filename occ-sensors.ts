import {
  InvokeFn,
  AxiosInstance,
  InvokeSuccess,
  InvokeError,
  axios,
} from "@normalframework/applications-sdk";
import { v4 as uuid } from "uuid";

const avuity: InvokeFn = async (points, sdk) => {
  const avuityData = await getAvuityData();
  try {
    await ensureEntityTypeCreated(sdk.http);
    await ensureSensorsCreatedAndTagged(sdk.http, avuityData, sdk.event);
    await updateValues(sdk.http, avuityData);
    return InvokeSuccess("All done");
  } catch (e: any) {
    sdk.event(e.message);
    return InvokeError(e.message);
  }
};

module.exports = avuity;

const ensureEntityTypeCreated = async (axios: AxiosInstance) => {
  try {
    const res = await axios.post("/api/v1/ontology/types", {
      entityType: {
        id: "OCCS#occs-1",
        name: "OCCS (2)",
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
    console.log(e.response);
    if (e.response.status !== 409) {
      throw e;
    }
  }
};

const ensureSensorsCreatedAndTagged = async (
  axios: AxiosInstance,
  avuityResponse: any,
  event: (msg: string) => void
) => {
  // event("tagging sensors");

  let existingSensors = await getBacnetSensors(axios);

  for await (const key of Object.keys(avuityResponse.items)) {
    const current = avuityResponse.items[key];
    if (
      !existingSensors.find(
        (s: any) => s.attrs.prop_object_name === current.areaName
      )
    ) {
      // event("did not find" + current.areaName);
      await createLocalBacnetObject(axios, current);
      await createEquipForSensor(axios, current);
      await tagLocalBacnetObject(axios, current);
    } else {
      console.log("!!! No update needed for ", current.areaName);
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
          type: "OCCS (2)",
          dataLayer: "hpl:bacnet:1",
          id: sensor.areaName,
          markers: "device,environment,occupancy,sensor",
          class: "OCCS",
        },
      },
    ],
  });
};

const tagLocalBacnetObject = async (normalHttp: AxiosInstance, sensor: any) => {
  const sensorsOnBacnet = await getBacnetSensors(normalHttp);
  const bacnetSensor = sensorsOnBacnet.find(
    (e: any) => e.attrs.prop_object_name === sensor.areaName
  );

  if (!bacnetSensor) return;

  await normalHttp.post("/api/v1/point/points", {
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
};

const getBacnetSensors = async (normalHttp: AxiosInstance) => {
  const { data } = await normalHttp.get(
    "/api/v1/point/points?layer=hpl:bacnet:1&responseFormat=0&pageOffset=0&pageSize=100&structuredQuery.field.property=device_prop_object_name&structuredQuery.field.text=NF"
  );
  return data.points;
};

const createLocalBacnetObject = async (
  normalHttp: AxiosInstance,
  area: any
) => {
  await normalHttp.post("/api/v1/bacnet/local", {
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
};

const getAvuityData = async () => {
  console.log("######## Starting to fetch avuity data");
  const { data } = await axios.get(
    "https://avuityoffice.avuity.com/VuSpace/api/real-time-occupancy/get-by-floor?buildingName=Avuity%20Office&floorName=Suite%20510&access-token=a4cGtYcRPdpwANr6"
  );
  console.log("######## Done Fetching avuity data");
  return data;
  // https://avuityoffice.avuity.com/VuSpace/api/real-time-occupancy/get-by-floor?buildingName=Avuity%20Office&floorName=Suite%20510&access-token=a4cGtYcRPdpwANr6
};

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
