const assert = require('node:assert');
const {fetchInUseAMIIDs, fetchAMIs, deleteAMIs} = require('../lib.js');

describe('lib', () => {
  describe('fetchInUseAMIIDs', () => {
    it('ASGs with Launch Configuration', async () => {
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
            promise: async () => ({AutoScalingGroups: [{
              LaunchConfigurationName: 'lc-1'
            }, {
              LaunchConfigurationName: 'lc-2'
            }]})
          };
        },
        describeLaunchConfigurations: (params) => {
          assert.deepStrictEqual(params.LaunchConfigurationNames, ['lc-1', 'lc-2']);
          return {
            promise: async () => ({LaunchConfigurations: [{
              ImageId: 'ami-1'
            }, {
              ImageId: 'ami-2'
            }]})
          };
        }
      };

      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 2);
      assert.strictEqual(inUseAMIIDs.has('ami-1'), true);
      assert.strictEqual(inUseAMIIDs.has('ami-2'), true);
    });
    it('ASGs with Launch Template', async () => {
      const ec2 = {
        describeInstances: () => {
          return {
            promise: async () => ({Reservations: []})
          };
        },
        describeLaunchTemplateVersions: (params) => {
          if (params.LaunchTemplateId === 'lt-1') {
            assert.deepStrictEqual(params.Versions, ['001']);
            return {
              promise: async () => ({LaunchTemplateVersions: [{
                LaunchTemplateData: {
                  ImageId: 'ami-1'
                }
              }]})
            };
          } else if (params.LaunchTemplateId === 'lt-2') {
            assert.deepStrictEqual(params.Versions, ['002']);
            return {
              promise: async () => ({LaunchTemplateVersions: [{
                LaunchTemplateData: {
                  ImageId: 'ami-2'
                }
              }]})
            };
          } else {
            assert.fail('unexpected LaunchTemplateId');
          }
        }
      };
      const autoscaling = {
        describeAutoScalingGroups: () => {
          return {
            promise: async () => ({AutoScalingGroups: [{
              LaunchTemplate: {
                LaunchTemplateId: 'lt-1',
                Version: '001'
              }
            }, {
              LaunchTemplate: {
                LaunchTemplateId: 'lt-2',
                Version: '002'
              }
            }]})
          };
        }
      };

      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 2);
      assert.strictEqual(inUseAMIIDs.has('ami-1'), true);
      assert.strictEqual(inUseAMIIDs.has('ami-2'), true);
    });
    it('ASGs with Mixed Instances Policy', async () => {
      const ec2 = {
        describeInstances: () => {
          return {
            promise: async () => ({Reservations: []})
          };
        },
        describeLaunchTemplateVersions: (params) => {
          if (params.LaunchTemplateId === 'lt-1') {
            assert.deepStrictEqual(params.Versions, ['001']);
            return {
              promise: async () => ({LaunchTemplateVersions: [{
                LaunchTemplateData: {
                  ImageId: 'ami-1'
                }
              }]})
            };
          } else if (params.LaunchTemplateId === 'lt-2') {
            assert.deepStrictEqual(params.Versions, ['002']);
            return {
              promise: async () => ({LaunchTemplateVersions: [{
                LaunchTemplateData: {
                  ImageId: 'ami-2'
                }
              }]})
            };
          } else {
            assert.fail('unexpected LaunchTemplateId');
          }
        }
      };
      const autoscaling = {
        describeAutoScalingGroups: () => {
          return {
            promise: async () => ({AutoScalingGroups: [{
              MixedInstancesPolicy: {
                LaunchTemplate: {
                  LaunchTemplateSpecification: {
                    LaunchTemplateId: 'lt-1',
                    Version: '001'
                  }
                }
              }
            }, {
              MixedInstancesPolicy: {
                LaunchTemplate: {
                  LaunchTemplateSpecification: {
                    LaunchTemplateId: 'lt-2',
                    Version: '002'
                  }
                }
              }
            }]})
          };
        }
      };

      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 2);
      assert.strictEqual(inUseAMIIDs.has('ami-1'), true);
      assert.strictEqual(inUseAMIIDs.has('ami-2'), true);
    });
    it('EC2 instances', async () => {
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
        }
      };

      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 0);
    });
  });
  describe('fetchAMIs', () => {
    it('includeName', async () => {
      const ec2 = {
        describeImages: (params) => {
          assert.deepStrictEqual(params,  { Owners: ['self'] });
          return {
            promise: async () => ({
              Images: [{
                ImageId: 'ami-1',
                Name: 'hello',
                CreationDate: '2023-05-28T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-1'}}]
              }, {
                ImageId: 'ami-2',
                Name: 'world',
                CreationDate: '2023-05-27T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-2'}}, {Ebs: {SnapshotId: 'snap-3'}}]
              }]
            })
          };
        }
      };
      const autoscaling = {};

      const amis = await fetchAMIs(ec2, autoscaling, 'he*', undefined, undefined, 0, false, 0);

      assert.deepStrictEqual(amis, [{
        id: 'ami-1',
        name: 'hello',
        creationDate: Date.parse('2023-05-28T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-1'}],
        excluded: false,
        excludeReasons: [],
        included: true,
        includeReasons: ['name match']
      }]);
    });
    it('includeTag', async () => {
      const ec2 = {
        describeImages: (params) => {
          assert.deepStrictEqual(params,  {
            Filters: [{
              Name: 'tag-key',
              Values: ['CostCenter']
            }],
            Owners: ['self']
          });
          return {
            promise: async () => ({
              Images: [{
                ImageId: 'ami-1',
                Name: 'ami-1',
                CreationDate: '2023-05-28T12:00:00.000Z',
                Tags: [{Key: 'CostCenter', Value: 'hello'}],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-1'}}]
              }, {
                ImageId: 'ami-2',
                Name: 'ami-2',
                CreationDate: '2023-05-27T12:00:00.000Z',
                Tags: [{Key: 'CostCenter', Value: 'world'}],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-2'}}, {Ebs: {SnapshotId: 'snap-3'}}]
              }]
            })
          };
        }
      };
      const autoscaling = {};

      const amis = await fetchAMIs(ec2, autoscaling, undefined, 'CostCenter', 'world', 0, false, 0);

      assert.deepStrictEqual(amis, [{
        id: 'ami-2',
        name: 'ami-2',
        creationDate: Date.parse('2023-05-27T12:00:00.000Z'),
        tags: {CostCenter: 'world'},
        blockDeviceMappings: [{snapshotId: 'snap-2'}, {snapshotId: 'snap-3'}],
        excluded: false,
        excludeReasons: [],
        included: true,
        includeReasons: ['tag match']
      }]);
    });
    // FIXME excludeNewest
    // FIXME excludeInUse
    // FIXME excludeDays
  });
  describe('deleteAMIs', () => {
    it('happy', async () => {
      const ec2 = {
        deregisterImage: (params) => {
          if (params.ImageId === 'ami-1' || params.ImageId === 'ami-2') {
            return {
              promise: async () => ({})
            };
          } else {
            assert.fail('unexpected ImageId');
          }
        },
        deleteSnapshot: (params) => {
          if (params.SnapshotId === 'snap-1' || params.SnapshotId === 'snap-2' || params.SnapshotId === 'snap-3') {
            return {
              promise: async () => ({})
            };
          } else {
            assert.fail('unexpected SnapshotId');
          }
        }
      };

      await deleteAMIs(ec2, [{id: 'ami-1', blockDeviceMappings: [{snapshotId: 'snap-1'}]}, {id: 'ami-1', blockDeviceMappings: [{snapshotId: 'snap-2'}, {snapshotId: 'snap-3'}]}]);
    });
  });
});
