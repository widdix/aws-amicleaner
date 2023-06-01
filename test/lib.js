const assert = require('node:assert');
const {fetchInUseAMIIDs/*, fetchAMIs, deleteAMIs*/} = require('../lib.js');

describe('lib', () => {
  describe('fetchInUseAMIIDs', () => {
    it('no ASGs, instances', async () => {
      const ec2 = {
        describeInstances: () => {
          return {
            promise: async () => ({
              Reservations: [{
                Instances: [{
                  ImageId: 'ami-1'
                }, {
                  ImageId: 'ami-2'
                }]
              }]
            })
          };
        }
      };
      const autoscaling = {
        describeAutoScalingGroups: () => {
          return {
            promise: async () => ({AutoScalingGroups: []})
          };
        },
        describeLaunchConfigurations: () => {
          return {
            promise: async () => ({LaunchConfigurations: []})
          };
        }
      };

      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 2);
      assert.strictEqual(inUseAMIIDs.has('ami-1'), true);
      assert.strictEqual(inUseAMIIDs.has('ami-2'), true);
    });
    it('no ASGs, no instances', async () => {
      const ec2 = {
        describeInstances: () => {
          return {
            promise: async () => ({Reservations: []})
          };
        }
      };
      const autoscaling = {
        describeAutoScalingGroups: () => {
          return {
            promise: async () => ({AutoScalingGroups: []})
          };
        },
        describeLaunchConfigurations: () => {
          return {
            promise: async () => ({LaunchConfigurations: []})
          };
        }
      };

      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 0);
    });
  });
  describe('fetchAMIs', () => {
  });
  describe('deleteAMIs', () => {
  });
});
