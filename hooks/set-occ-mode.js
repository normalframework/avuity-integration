const NormalSdk = require("@normalframework/applications-sdk");

/**
 * Invoke hook function
 * @param {NormalSdk.InvokeParams} params
 * @returns {NormalSdk.InvokeResult}
 */
module.exports = async ({ points }) => {
  for await (const sensor of points) {
    if (await sensor.trueFor("30s", (v) => v.value === 0, "hpl:bacnet:1")) {
      console.log(`${sensor.latestValue.value} is unoccupied!`);
    } else {
      console.log(
        `${sensor.attrs.prop_object_name} has ${sensor.latestValue.value} occupants`
      );
    }
  }
};
