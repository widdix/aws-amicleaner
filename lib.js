import wildcard from 'wildcard';
import pLimit from 'p-limit';
import {paginateDescribeLaunchConfigurations} from '@aws-sdk/client-auto-scaling';
import {DescribeRegionsCommand, paginateDescribeInstances, DescribeLaunchTemplateVersionsCommand, paginateDescribeImages, DeregisterImageCommand, DeleteSnapshotCommand, paginateDescribeLaunchTemplates} from '@aws-sdk/client-ec2';

function mapAMI(raw) {
  return {
    id: raw.ImageId,
    name: raw.Name,
    creationDate: Date.parse(raw.CreationDate),
    tags: raw.Tags.reduce((acc, {Key: key, Value: value}) => {
      acc[key] = value;
      return acc;
    }, {}),
    blockDeviceMappings: raw.BlockDeviceMappings.filter(raw => raw.Ebs).map(raw => ({snapshotId: raw.Ebs.SnapshotId})),
    excluded: false,
    excludeReasons: [],
    included: false,
    includeReasons: []
  };
}

export async function fetchRegions(ec2, rawRegions) {
  const regions = new Set();

  if (rawRegions.length === 0) {
    regions.add(undefined);
  }

  rawRegions.filter(region => !region.includes('*')).forEach(region => regions.add(region));

  const rawRegionsWithWildcard = rawRegions.filter(region => region.includes('*'));
  if (rawRegionsWithWildcard.length !== 0) {
    const {Regions} = await ec2.send(new DescribeRegionsCommand({}));
    rawRegionsWithWildcard.forEach(rawRegionWithWildcard => {
      wildcard(rawRegionWithWildcard, Regions.map(r => r.RegionName)).forEach(region => regions.add(region));
    });
  }

  return regions;
}

export async function fetchInUseAMIIDs(ec2, autoscaling) {
  const inUseAMIIDs = new Set();

  const instancePaginator = paginateDescribeInstances({
    client: ec2
  }, {
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
  });
  for await (const page of instancePaginator) {
    for (const reservation of page.Reservations) {
      reservation.Instances.forEach(instance => inUseAMIIDs.add(instance.ImageId));
    }
  }

  const lcPaginator = paginateDescribeLaunchConfigurations({client: autoscaling}, {});
  for await (const page of lcPaginator) {
    page.LaunchConfigurations.forEach(lc => inUseAMIIDs.add(lc.ImageId));
  }

  const ltPaginator = paginateDescribeLaunchTemplates({client: ec2}, {});
  const ltLimit = pLimit(5);
  for await (const page of ltPaginator) {
    await Promise.all(
      page.LaunchTemplates.map(({LaunchTemplateId: id, DefaultVersionNumber: version}) => ltLimit(async () => { 
        const data = await ec2.send(new DescribeLaunchTemplateVersionsCommand({
          LaunchTemplateId: id,
          Versions: [version]
        }));
        inUseAMIIDs.add(data.LaunchTemplateVersions[0].LaunchTemplateData.ImageId);
      }))
    );
  }

  return inUseAMIIDs;
}

export async function fetchAMIs(now, ec2, autoscaling, includeName, includeTagKey, includeTagValue, excludeNewest, excludeInUse, excludeDays) {
  let amis = [];
  const input = {
    Owners: ['self']
  };
  if (includeTagKey !== undefined) {
    input.Filters = [{
      Name: 'tag-key',
      Values: [includeTagKey]
    }];
  }
  const paginator = paginateDescribeImages({
    client: ec2
  }, input);
  for await (const page of paginator) {
    page.Images.forEach(rawAMI => amis.push(mapAMI(rawAMI)));
  }

  if (includeName !== undefined) {
    amis = amis.filter(ami => wildcard(includeName, ami.name)).map(ami => {
      ami.included = true;
      ami.includeReasons.push('name match');
      return ami;
    });
  } else if (includeTagKey !== undefined) {
    amis = amis.filter(ami => wildcard(includeTagValue, ami.tags[includeTagKey])).map(ami => {
      ami.included = true;
      ami.includeReasons.push('tag match');
      return ami;
    });
  } else {
    throw new Error('no include defined');
  }

  if (excludeInUse === true) {
    const inUseAMIIDs = await fetchInUseAMIIDs(ec2, autoscaling);
    amis = amis.map(ami => {
      if (inUseAMIIDs.has(ami.id)) {
        ami.excluded = true;
        ami.excludeReasons.push('in use');
      }
      return ami;
    });
  }

  if (excludeDays > 0) {
    const ts = now-(excludeDays*24*60*60*1000);
    amis = amis.map(ami => {
      if (ami.creationDate > ts) {
        ami.excluded = true;
        ami.excludeReasons.push('days not passed');
      }
      return ami;
    });

  }

  if (excludeNewest > 0) {
    amis = amis.sort((a, b) => b.creationDate-a.creationDate).map((ami, i) => {
      if (i < excludeNewest) {
        ami.excluded = true;
        ami.excludeReasons.push('newest');
      }
      return ami;
    });
  }

  return amis;
}

export async function deleteAMI(ec2, ami) {
  await ec2.send(new DeregisterImageCommand({
    ImageId: ami.id
  }));
  console.log(`AMI ${ami.id} deregistered`);
  for (const blockDevice of ami.blockDeviceMappings) {
    await ec2.send(new DeleteSnapshotCommand({
      SnapshotId: blockDevice.snapshotId
    }));
    console.log(`snapshot ${blockDevice.snapshotId} of AMI ${ami.id} deleted`);
  }
}
