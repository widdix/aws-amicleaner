const wildcard = require('wildcard');
const pLimit = require('p-limit');

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

  const {Reservations: reservations} = await ec2.describeInstances({ // FIXME paging
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
  reservations.map(reservation => reservation.Instances.forEach(instance => inUseAMIIDs.add(instance.ImageId)));

  const {AutoScalingGroups: asgs} = await autoscaling.describeAutoScalingGroups({}).promise(); // FIXME paging

  // in use by ASG -> Launch Configuration
  const inUseLCNames = asgs.filter(asg => 'LaunchConfigurationName' in asg).map(asg => asg.LaunchConfigurationName);
  if (inUseLCNames.length > 0) {
    const {LaunchConfigurations: lcs} = await autoscaling.describeLaunchConfigurations({
      LaunchConfigurationNames: inUseLCNames // FIXME Maximum number of 50 items, paging
    }).promise();
    lcs.forEach(lc => inUseAMIIDs.add(lc.ImageId));
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

async function fetchAMIs(ec2, autoscaling, includeName, includeTagKey, includeTagValue, excludeNewest, excludeInUse, excludeDays) {
  const params = {
    Owners: ['self']
  };
  if (includeTagKey !== undefined) {
    params.Filters = [{
      Name: 'tag-key',
      Values: [includeTagKey]
    }];
  }
  const {Images: rawAMIs} = await ec2.describeImages(params).promise(); // FIXME paging

  let amis = rawAMIs.map(mapAMI);
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
    const ts = Date.now()-(excludeDays*24*60*60*1000);
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

async function deleteAMIs(ec2, amis) {
  // TODO speed up by using pLimit
  for (const ami of amis) {
    await ec2.deregisterImage({
      ImageId: ami.id
    }).promise();
    console.log(`AMI ${ami.id} deregistered`);
    for (const blockDevice of ami.blockDeviceMappings) {
      await ec2.deleteSnapshot({
        SnapshotId: blockDevice.snapshotId
      }).promise();
      console.log(`snapshot ${blockDevice.snapshotId} deleted`);
    }
  }
}
exports.deleteAMIs = deleteAMIs;