const wildcard = require('wildcard');
const pLimit = require('p-limit');

const MAX_ITEMS_PER_LAUNCH_CONFIGURATION_PAGE = 50;

function mapAMI(raw) {
  return {
    id: raw.ImageId,
    name: raw.Name,
    creationDate: Date.parse(raw.CreationDate),
    tags: raw.Tags.reduce((acc, {Key: key, Value: value}) => {
      acc[key] = value;
      return acc;
    }, {}),
    blockDeviceMappings: raw.BlockDeviceMappings.map(raw => ({snapshotId: raw.Ebs.SnapshotId})),
    excluded: false,
    excludeReasons: [],
    included: false,
    includeReasons: []
  };
}

async function fetchInUseAMIIDs(ec2, autoscaling) {
  const inUseAMIIDs = new Set();

  for await (const reservation of (async function*() {
    let nextToken = '';
    while (nextToken !== undefined) {
      const {Reservations: reservations, NextToken} = await ec2.describeInstances({
        NextToken: (nextToken === '') ? undefined : nextToken,
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
      }).promise();
      yield* reservations;
      nextToken = NextToken;
    }
  })()) {
    reservation.Instances.forEach(instance => inUseAMIIDs.add(instance.ImageId));
  }

  const asgs = [];
  for await (const asg of (async function*() {
    let nextToken = '';
    while (nextToken !== undefined) {
      const {AutoScalingGroups, NextToken} = await autoscaling.describeAutoScalingGroups({
        NextToken: (nextToken === '') ? undefined : nextToken
      }).promise();
      yield* AutoScalingGroups;
      nextToken = NextToken;
    }
  })()) {
    asgs.push(asg);
  }

  // in use by ASG -> Launch Configuration
  const inUseLCNames = asgs.filter(asg => 'LaunchConfigurationName' in asg).map(asg => asg.LaunchConfigurationName);
  if (inUseLCNames.length > 0) {
    for (let i = 0; i < Math.ceil(inUseLCNames.length/MAX_ITEMS_PER_LAUNCH_CONFIGURATION_PAGE); i++) {
      const {LaunchConfigurations: lcs} = await autoscaling.describeLaunchConfigurations({
        LaunchConfigurationNames: inUseLCNames.slice(i*MAX_ITEMS_PER_LAUNCH_CONFIGURATION_PAGE, (i+1)*MAX_ITEMS_PER_LAUNCH_CONFIGURATION_PAGE)
      }).promise();
      lcs.forEach(lc => inUseAMIIDs.add(lc.ImageId));
    }
  }

  const inUseLTs = [
    ...asgs.filter(asg => 'LaunchTemplate' in asg).map(asg => ({id: asg.LaunchTemplate.LaunchTemplateId, version: asg.LaunchTemplate.Version})),
    ...asgs.filter(asg => 'MixedInstancesPolicy' in asg).map(asg => ({id: asg.MixedInstancesPolicy.LaunchTemplate.LaunchTemplateSpecification.LaunchTemplateId, version: asg.MixedInstancesPolicy.LaunchTemplate.LaunchTemplateSpecification.Version}))
  ];
  const limit = pLimit(5);
  await Promise.all(
    inUseLTs.map(({id, version}) => limit(() => 
      ec2.describeLaunchTemplateVersions({
        LaunchTemplateId: id,
        Versions: [version]
      }).promise().then(data => data.LaunchTemplateVersions[0].LaunchTemplateData.ImageId))
    )
  ).then(amiIDs => amiIDs.forEach(amiID => inUseAMIIDs.add(amiID)));

  return inUseAMIIDs;
}
exports.fetchInUseAMIIDs = fetchInUseAMIIDs;

async function fetchAMIs(now, ec2, autoscaling, includeName, includeTagKey, includeTagValue, excludeNewest, excludeInUse, excludeDays) {
  let amis = [];
  for await (const rawAMI of (async function*() {
    let nextToken = '';
    while (nextToken !== undefined) {
      const params = {
        Owners: ['self']
      };
      if (includeTagKey !== undefined) {
        params.Filters = [{
          Name: 'tag-key',
          Values: [includeTagKey]
        }];
      }
      if (nextToken !== '') {
        params.NextToken = nextToken;
      }
      const {Images, NextToken} = await ec2.describeImages(params).promise();
      yield* Images;
      nextToken = NextToken;
    }
  })()) {
    amis.push(mapAMI(rawAMI));
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
exports.fetchAMIs = fetchAMIs;

async function deleteAMI(ec2, ami) {
  await ec2.deregisterImage({
    ImageId: ami.id
  }).promise();
  console.log(`AMI ${ami.id} deregistered`);
  for (const blockDevice of ami.blockDeviceMappings) {
    await ec2.deleteSnapshot({
      SnapshotId: blockDevice.snapshotId
    }).promise();
    console.log(`snapshot ${blockDevice.snapshotId} of AMI ${ami.id} deleted`);
  }
}

async function deleteAMIs(ec2, amis) {
  const limit = pLimit(5);
  await Promise.all(amis.map(ami => limit(() => deleteAMI(ec2, ami))));
}
exports.deleteAMIs = deleteAMIs;