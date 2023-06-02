const { createInterface } = require('node:readline');
const { ArgumentParser, BooleanOptionalAction } = require('argparse');
const {fetchAMIs, deleteAMIs} = require('./lib.js');

const AWS = require('aws-sdk');
const PrettyTable = require('./prettytable.js');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
}); 

async function input(query) {
  return new Promise(resolve => {
    rl.question(query, answer => resolve(answer));
  });
}

async function run({
  includeName,
  includeTagKey,
  includeTagValue,
  excludeNewest,
  excludeInUse,
  excludeDays,
  forceDelete,
  verbose
}) {
  const now = Date.now();
  const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
  const autoscaling = new AWS.AutoScaling({apiVersion: '2011-01-01'});

  let amis = await fetchAMIs(now, ec2, autoscaling, includeName, includeTagKey, includeTagValue, excludeNewest, excludeInUse, excludeDays);

  if (verbose === true) {
    const pt = new PrettyTable();
    pt.sortTable('Name');
    pt.create(['ID', 'Name', 'Creation Date', 'Delete?', 'Include reasons', 'Exclude reasons'], amis.map(ami => [
      ami.id,
      ami.name,
      new Date(ami.creationDate).toISOString(),
      (ami.included === true && ami.excluded === false) ? 'yes' : 'no',
      (ami.included === true) ? ami.includeReasons.join(', ') : '',
      (ami.excluded === true) ? ami.excludeReasons.join(', ') : ''
    ]));
    pt.print();
  }

  amis = amis.filter(ami => ami.included === true && ami.excluded === false);

  if (amis.length === 0) {
    return;
  }

  let del = false;
  if (forceDelete === true) {
    del = true;
  } else {
    const answer = await input(`Do you want to continue and remove ${amis.length} AMIs [y/N] ? : `);
    del = answer === 'y';
  }

  if (del === true) {
    await deleteAMIs(ec2, amis);
  } else {
    return;
  }
}

function readArgs() {
  const parser = new ArgumentParser({
    prog: 'aws-amicleaner',
    description: 'To clean up your AWS AMIs: First, include AMIs by name or tag. Second, exclude AMIs in use, younger than N days, or the newest N images. Third, manually confirm the list of AMIs for deletion.',
    usage: `To delete all AMIs where the name starts with amiprefix-, are older than 5 days, and not the newest 3 images, run:
aws-amicleaner --include-name 'amiprefix-*' --exclude-newest 3 --exclude-days 5 --exclude-in-use --verbose

To delete all AMIs tagged with CostCenter=X342-*-1111, are older than 7 days (default), are not the newest 5 images (default), and are not in use (default), run:
aws-amicleaner --include-tag-key CostCenter --include-tag-value 'X342-*-1111'

Run the command without confirmation (useful in scripts):
aws-amicleaner --include-tag-key CostCenter --include-tag-value 'X342-*-1111' --force-delete

To disable the defaults, run:
aws-amicleaner --include-name 'amiprefix-*' --exclude-newest 0 --exclude-days 0 --no-exclude-in-use --no-verbose
`
  });
  parser.add_argument('--include-name', {dest: 'includeName', type: 'string', help: 'The name that must be present, wildcard * supported'});
  parser.add_argument('--include-tag-key', {dest: 'includeTagKey', type: 'string', help: 'The tag key that must be present'});
  parser.add_argument('--include-tag-value', {dest: 'includeTagValue', type: 'string', help: 'The tag value (for the tag key) that must be present, wildcard * supported'});
  parser.add_argument('--exclude-newest', {dest: 'excludeNewest', type: 'int', default: 5, help: 'Exclude the newest N AMIs'});
  parser.add_argument('--exclude-days', {dest: 'excludeDays', type: 'int', default: 7, help: 'Exclude AMIs from deletion that are younger than N days'});
  parser.add_argument('--exclude-in-use', {dest: 'excludeInUse', default: true, action: BooleanOptionalAction, help: 'Exclude AMIs from deletion that are in use by EC2 instances, ASGs, Launch Configurations, and Launch Templates'});
  parser.add_argument('-f', '--force-delete', {dest: 'forceDelete', default: false, action: BooleanOptionalAction, help: 'Skip confirmation before deletion'});
  parser.add_argument('--verbose', {dest: 'verbose', default: true, action: BooleanOptionalAction, help: 'Display additional information'});
  const args = parser.parse_args();

  if (args.includeName === undefined && args.includeTagKey === undefined) {
    throw new Error('--include-name or --include-tag-key missing');
  }
  if (args.includeName !== undefined && args.includeTagKey !== undefined) {
    throw new Error('Use either --include-name or --include-tag-key');
  }
  if (args.includeTagKey !== undefined && args.includeTagValue === undefined) {
    throw new Error('--include-tag-value missing');
  }

  return args;
}

const args = readArgs();

if (args.verbose === true) {
  console.log('args', args);
}

run(args).then(() => process.exit(0));
