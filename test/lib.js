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
        describeAutoScalingGroups: (params) => {
          if (params.NextToken === '123') {
            return {
              promise: async () => ({
                AutoScalingGroups: [{
                  LaunchConfigurationName: 'lc-3'
                }]
              })
            };
          } else if (params.NextToken === undefined) {
            return {
              promise: async () => ({
                AutoScalingGroups: [{
                  LaunchConfigurationName: 'lc-1'
                }, {
                  LaunchConfigurationName: 'lc-2'
                }],
                NextToken: '123'
              })
            };
          } else {
            assert.fail('unexpected NextToken');
          }
        },
        describeLaunchConfigurations: (params) => {
          assert.deepStrictEqual(params.LaunchConfigurationNames, ['lc-1', 'lc-2', 'lc-3']);
          return {
            promise: async () => ({LaunchConfigurations: [{
              ImageId: 'ami-1'
            }, {
              ImageId: 'ami-2'
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
        describeInstances: (params) => {
          if (params.NextToken === '123') {
            return {
              promise: async () => ({
                Reservations: [{
                  Instances: [{
                    ImageId: 'ami-2'
                  }]
                }]
              })
            };
          } else if (params.NextToken === undefined) {
            return {
              promise: async () => ({
                Reservations: [{
                  Instances: [{
                    ImageId: 'ami-1'
                  }]
                }, {
                  Instances: [{
                    ImageId: 'ami-1'
                  }]
                }],
                NextToken: '123'
              })
            };
          } else {
            assert.fail('unexpected NextToken');
          }
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
    it('paging', async () => {
      const now = Date.parse('2023-05-29T12:00:00.000Z');
      const ec2 = {
        describeImages: (params) => {
          assert.deepStrictEqual(params.Owners, ['self']);
          if (params.NextToken === '123') {
            return {
              promise: async () => ({
                Images: [{
                  ImageId: 'ami-3',
                  Name: 'hello-3',
                  CreationDate: '2023-05-26T12:00:00.000Z',
                  Tags: [],
                  BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-3'}}]
                }]
              })
            };
          } else if (params.NextToken === undefined) {
            return {
              promise: async () => ({
                Images: [{
                  ImageId: 'ami-1',
                  Name: 'hello-1',
                  CreationDate: '2023-05-28T12:00:00.000Z',
                  Tags: [],
                  BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-1'}}]
                }, {
                  ImageId: 'ami-2',
                  Name: 'hello-2',
                  CreationDate: '2023-05-27T12:00:00.000Z',
                  Tags: [],
                  BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-2'}}]
                }],
                NextToken: '123'
              })
            };
          } else {
            assert.fail('unexpected NextToken');
          }
        }
      };
      const autoscaling = {};

      const amis = await fetchAMIs(now, ec2, autoscaling, 'hello-*', undefined, undefined, 2, false, 0);

      assert.deepStrictEqual(amis, [{
        id: 'ami-1',
        name: 'hello-1',
        creationDate: Date.parse('2023-05-28T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-1'}],
        excluded: true,
        excludeReasons: ['newest'],
        included: true,
        includeReasons: ['name match']
      }, {
        id: 'ami-2',
        name: 'hello-2',
        creationDate: Date.parse('2023-05-27T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-2'}],
        excluded: true,
        excludeReasons: ['newest'],
        included: true,
        includeReasons: ['name match']
      }, {
        id: 'ami-3',
        name: 'hello-3',
        creationDate: Date.parse('2023-05-26T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-3'}],
        excluded: false,
        excludeReasons: [],
        included: true,
        includeReasons: ['name match']
      }]);
    });
    it('includeName', async () => {
      const now = Date.parse('2023-05-29T12:00:00.000Z');
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

      const amis = await fetchAMIs(now, ec2, autoscaling, 'he*', undefined, undefined, 0, false, 0);

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
      const now = Date.parse('2023-05-29T12:00:00.000Z');
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

      const amis = await fetchAMIs(now, ec2, autoscaling, undefined, 'CostCenter', 'world', 0, false, 0);

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
    it('excludeNewest', async () => {
      const now = Date.parse('2023-05-29T12:00:00.000Z');
      const ec2 = {
        describeImages: (params) => {
          assert.deepStrictEqual(params,  { Owners: ['self'] });
          return {
            promise: async () => ({
              Images: [{
                ImageId: 'ami-1',
                Name: 'hello-1',
                CreationDate: '2023-05-28T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-1'}}]
              }, {
                ImageId: 'ami-2',
                Name: 'hello-2',
                CreationDate: '2023-05-27T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-2'}}]
              }, {
                ImageId: 'ami-3',
                Name: 'hello-3',
                CreationDate: '2023-05-26T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-3'}}]
              }]
            })
          };
        }
      };
      const autoscaling = {};

      const amis = await fetchAMIs(now, ec2, autoscaling, 'hello-*', undefined, undefined, 2, false, 0);

      assert.deepStrictEqual(amis, [{
        id: 'ami-1',
        name: 'hello-1',
        creationDate: Date.parse('2023-05-28T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-1'}],
        excluded: true,
        excludeReasons: ['newest'],
        included: true,
        includeReasons: ['name match']
      }, {
        id: 'ami-2',
        name: 'hello-2',
        creationDate: Date.parse('2023-05-27T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-2'}],
        excluded: true,
        excludeReasons: ['newest'],
        included: true,
        includeReasons: ['name match']
      }, {
        id: 'ami-3',
        name: 'hello-3',
        creationDate: Date.parse('2023-05-26T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-3'}],
        excluded: false,
        excludeReasons: [],
        included: true,
        includeReasons: ['name match']
      }]);
    });
    it('excludeInUse', async () => {
      const now = Date.parse('2023-05-29T12:00:00.000Z');
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
        },
        describeImages: (params) => {
          assert.deepStrictEqual(params,  { Owners: ['self'] });
          return {
            promise: async () => ({
              Images: [{
                ImageId: 'ami-1',
                Name: 'hello-1',
                CreationDate: '2023-05-28T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-1'}}]
              }, {
                ImageId: 'ami-2',
                Name: 'hello-2',
                CreationDate: '2023-05-27T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-2'}}]
              }, {
                ImageId: 'ami-3',
                Name: 'hello-3',
                CreationDate: '2023-05-26T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-3'}}]
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

      const amis = await fetchAMIs(now, ec2, autoscaling, 'hello-*', undefined, undefined, 0, true, 0);

      assert.deepStrictEqual(amis, [{
        id: 'ami-1',
        name: 'hello-1',
        creationDate: Date.parse('2023-05-28T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-1'}],
        excluded: true,
        excludeReasons: ['in use'],
        included: true,
        includeReasons: ['name match']
      }, {
        id: 'ami-2',
        name: 'hello-2',
        creationDate: Date.parse('2023-05-27T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-2'}],
        excluded: true,
        excludeReasons: ['in use'],
        included: true,
        includeReasons: ['name match']
      }, {
        id: 'ami-3',
        name: 'hello-3',
        creationDate: Date.parse('2023-05-26T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-3'}],
        excluded: false,
        excludeReasons: [],
        included: true,
        includeReasons: ['name match']
      }]);
    });
    it('excludeDays', async () => {
      const now = Date.parse('2023-05-29T12:00:00.000Z');
      const ec2 = {
        describeImages: (params) => {
          assert.deepStrictEqual(params,  { Owners: ['self'] });
          return {
            promise: async () => ({
              Images: [{
                ImageId: 'ami-1',
                Name: 'hello-1',
                CreationDate: '2023-05-28T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-1'}}]
              }, {
                ImageId: 'ami-2',
                Name: 'hello-2',
                CreationDate: '2023-05-27T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-2'}}]
              }, {
                ImageId: 'ami-3',
                Name: 'hello-3',
                CreationDate: '2023-05-26T12:00:00.000Z',
                Tags: [],
                BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-3'}}]
              }]
            })
          };
        }
      };
      const autoscaling = {};

      const amis = await fetchAMIs(now, ec2, autoscaling, 'hello-*', undefined, undefined, 0, false, 3);

      assert.deepStrictEqual(amis, [{
        id: 'ami-1',
        name: 'hello-1',
        creationDate: Date.parse('2023-05-28T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-1'}],
        excluded: true,
        excludeReasons: ['days not passed'],
        included: true,
        includeReasons: ['name match']
      }, {
        id: 'ami-2',
        name: 'hello-2',
        creationDate: Date.parse('2023-05-27T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-2'}],
        excluded: true,
        excludeReasons: ['days not passed'],
        included: true,
        includeReasons: ['name match']
      }, {
        id: 'ami-3',
        name: 'hello-3',
        creationDate: Date.parse('2023-05-26T12:00:00.000Z'),
        tags: {},
        blockDeviceMappings: [{snapshotId: 'snap-3'}],
        excluded: false,
        excludeReasons: [],
        included: true,
        includeReasons: ['name match']
      }]);
    });
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
