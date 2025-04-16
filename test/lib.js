import assert from 'node:assert';
import {mockClient} from 'aws-sdk-client-mock';
import {fetchRegions, fetchInUseAMIIDs, fetchAMIs, deleteAMI} from '../lib.js';
import {EC2Client, DescribeRegionsCommand, DescribeInstancesCommand, DescribeLaunchTemplatesCommand, DescribeLaunchTemplateVersionsCommand, DeregisterImageCommand, DeleteSnapshotCommand, DescribeImagesCommand} from '@aws-sdk/client-ec2';
import {AutoScalingClient, DescribeLaunchConfigurationsCommand} from '@aws-sdk/client-auto-scaling';

describe('lib', () => {
  describe('fetchRegions', () => {
    it('no regions', async () => {
      const ec2 = new EC2Client({});
      mockClient(ec2);
      const regions = await fetchRegions(ec2, []);
      assert.strictEqual(regions.size, 1);
      assert.strictEqual(regions.has(undefined), true);
    });
    it('exact name', async () => {
      const ec2 = new EC2Client({});
      mockClient(ec2);
      const regions = await fetchRegions(ec2, ['eu-west-1']);
      assert.strictEqual(regions.size, 1);
      assert.strictEqual(regions.has('eu-west-1'), true);
    });
    it('wildcrard', async () => {
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      ec2Mock.on(DescribeRegionsCommand).resolvesOnce({
        Regions: [{
          RegionName: 'eu-west-1'
        }, {
          RegionName: 'eu-west-2'
        }, {
          RegionName: 'eu-west-3'
        }, {
          RegionName: 'us-east-1'
        }, {
          RegionName: 'us-east-2'
        }]
      });
      const regions = await fetchRegions(ec2, ['eu-west-*']);
      assert.strictEqual(regions.size, 3);
      assert.strictEqual(regions.has('eu-west-1'), true);
      assert.strictEqual(regions.has('eu-west-2'), true);
      assert.strictEqual(regions.has('eu-west-3'), true);
    });
  });
  describe('fetchInUseAMIIDs', () => {
    it('Launch Configuration', async () => {
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      const autoscalingMock = mockClient(autoscaling);
      ec2Mock.on(DescribeInstancesCommand).resolvesOnce({
        Reservations: []
      });
      autoscalingMock.on(DescribeLaunchConfigurationsCommand).resolvesOnce({
        LaunchConfigurations: [{
          ImageId: 'ami-1'
        }, {
          ImageId: 'ami-2'
        }, {
          ImageId: 'ami-2'
        }]
      });
      ec2Mock.on(DescribeLaunchTemplatesCommand).resolvesOnce({
        LaunchTemplates: []
      });
      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 2);
      assert.strictEqual(inUseAMIIDs.has('ami-1'), true);
      assert.strictEqual(inUseAMIIDs.has('ami-2'), true);
    });
    it('Launch Template', async () => {
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      const autoscalingMock = mockClient(autoscaling);
      ec2Mock.on(DescribeInstancesCommand).resolvesOnce({
        Reservations: []
      });
      autoscalingMock.on(DescribeLaunchConfigurationsCommand).resolvesOnce({
        LaunchConfigurations: []
      });
      ec2Mock.on(DescribeLaunchTemplatesCommand).resolvesOnce({
        LaunchTemplates: [{
          LaunchTemplateId: 'lt-1',
          DefaultVersionNumber: '001'
        }, {
          LaunchTemplateId: 'lt-2',
          DefaultVersionNumber: '002'
        }]
      });
      ec2Mock.on(DescribeLaunchTemplateVersionsCommand, {
        LaunchTemplateId: 'lt-1',
        Versions: ['001']
      }).resolvesOnce({
        LaunchTemplateVersions: [{
          LaunchTemplateData: {
            ImageId: 'ami-1'
          }
        }]
      });
      ec2Mock.on(DescribeLaunchTemplateVersionsCommand, {
        LaunchTemplateId: 'lt-2',
        Versions: ['002']
      }).resolvesOnce({
        LaunchTemplateVersions: [{
          LaunchTemplateData: {
            ImageId: 'ami-2'
          }
        }]
      });
      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 2);
      assert.strictEqual(inUseAMIIDs.has('ami-1'), true);
      assert.strictEqual(inUseAMIIDs.has('ami-2'), true);
    });
    it('EC2 instances', async () => {
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      const autoscalingMock = mockClient(autoscaling);
      ec2Mock.on(DescribeInstancesCommand, {
        Filters: [{
          Name: 'instance-state-name',
          Values: [
            'pending',
            'running',
            'shutting-down',
            'stopping',
            'stopped'
          ]
        }]
      }).resolvesOnce({
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
      });
      ec2Mock.on(DescribeInstancesCommand, {
        Filters: [{
          Name: 'instance-state-name',
          Values: [
            'pending',
            'running',
            'shutting-down',
            'stopping',
            'stopped'
          ]
        }],
        NextToken: '123'
      }).resolvesOnce({
        Reservations: [{
          Instances: [{
            ImageId: 'ami-2'
          }]
        }]
      });
      autoscalingMock.on(DescribeLaunchConfigurationsCommand).resolvesOnce({
        LaunchConfigurations: []
      });
      ec2Mock.on(DescribeLaunchTemplatesCommand).resolvesOnce({
        LaunchTemplates: []
      });
      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 2);
      assert.strictEqual(inUseAMIIDs.has('ami-1'), true);
      assert.strictEqual(inUseAMIIDs.has('ami-2'), true);
    });
    it('no ASGs, no instances', async () => {
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      const autoscalingMock = mockClient(autoscaling);
      ec2Mock.on(DescribeInstancesCommand).resolvesOnce({
        Reservations: []
      });
      autoscalingMock.on(DescribeLaunchConfigurationsCommand).resolvesOnce({
        LaunchConfigurations: []
      });
      ec2Mock.on(DescribeLaunchTemplatesCommand).resolvesOnce({
        LaunchTemplates: []
      });
      const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
      assert.strictEqual(inUseAMIIDs.size, 0);
    });
  });
  describe('fetchAMIs', () => {
    it('paging', async () => {
      const now = Date.parse('2023-05-29T12:00:00.000Z');
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      mockClient(autoscaling);
      ec2Mock.on(DescribeImagesCommand).resolvesOnce({
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
      });
      ec2Mock.on(DescribeImagesCommand, {NextToken: '123'}).resolvesOnce({
        Images: [{
          ImageId: 'ami-3',
          Name: 'hello-3',
          CreationDate: '2023-05-26T12:00:00.000Z',
          Tags: [],
          BlockDeviceMappings: [{Ebs: {SnapshotId: 'snap-3'}}]
        }]
      });
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
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      mockClient(autoscaling);
      ec2Mock.on(DescribeImagesCommand, {
        Owners: ['self']
      }).resolvesOnce({
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
      });
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
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      mockClient(autoscaling);
      ec2Mock.on(DescribeImagesCommand, {
        Filters: [{
          Name: 'tag-key',
          Values: ['CostCenter']
        }],
        Owners: ['self']
      }).resolvesOnce({
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
      });
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
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      mockClient(autoscaling);
      ec2Mock.on(DescribeImagesCommand, {
        Owners: ['self']
      }).resolvesOnce({
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
      });
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
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      const autoscalingMock = mockClient(autoscaling);
      ec2Mock.on(DescribeInstancesCommand).resolvesOnce({
        Reservations: [{
          Instances: [{
            ImageId: 'ami-1'
          }, {
            ImageId: 'ami-2'
          }]
        }]
      });
      autoscalingMock.on(DescribeLaunchConfigurationsCommand).resolvesOnce({
        LaunchConfigurations: []
      });
      ec2Mock.on(DescribeLaunchTemplatesCommand).resolvesOnce({
        LaunchTemplates: []
      });
      ec2Mock.on(DescribeImagesCommand, {
        Owners: ['self']
      }).resolvesOnce({
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
      });
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
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      const autoscaling = new AutoScalingClient({});
      mockClient(autoscaling);
      ec2Mock.on(DescribeImagesCommand, {
        Owners: ['self']
      }).resolvesOnce({
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
      });
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
  describe('deleteAMI', () => {
    it('happy', async () => {
      const ec2 = new EC2Client({});
      const ec2Mock = mockClient(ec2);
      ec2Mock.on(DeregisterImageCommand, {
        ImageId: 'ami-1'
      }).resolvesOnce({});
      ec2Mock.on(DeleteSnapshotCommand, {
        SnapshotId: 'snap-1'
      }).resolvesOnce({});
      await deleteAMI(ec2, {id: 'ami-1', blockDeviceMappings: [{snapshotId: 'snap-1'}]});
    });
  });
});
