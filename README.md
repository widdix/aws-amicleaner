To clean up your AWS AMIs: 
1. Include AMIs by name or tag.
2. Exclude AMIs in use, younger than N days, or the newest N images.
3. Manually confirm the list of AMIs for deletion.

## Examples

To delete all AMIs where the name starts with amiprefix-, are older than 5 days, and not the newest 3 images, run:
```bash
aws-amicleaner --include-name 'amiprefix-*' --exclude-newest 3 --exclude-days 5 --exclude-in-use --verbose
```

A typical confirmation screen:

```
+-------------+----------------------+--------------------------+-----------------+-------------------------+
| ID          | Name                 | Creation Date            | Include reasons | Exclude reasons         | 
+-------------+----------------------+--------------------------+-----------------+-------------------------+
| ami-0a...72 | amiprefix-1685107232 | 2023-05-27T13:32:21.000Z | name match      | days not passed, newest | 
| ami-02...3f | amiprefix-1685103569 | 2023-05-27T12:30:50.000Z | name match      | days not passed, newest | 
| ami-09...d5 | amiprefix-1685095689 | 2023-05-27T10:19:59.000Z | name match      | days not passed, newest | 
| ami-0f...c7 | amiprefix-1685039741 | 2023-05-26T18:47:37.000Z | name match      | days not passed         | 
| ami-0f...f0 | amiprefix-1685018189 | 2023-05-26T12:49:02.000Z | name match      | days not passed         | 
| ami-06...a8 | amiprefix-1685015512 | 2023-05-26T12:04:39.000Z | name match      | days not passed         | 
| ami-04...44 | amiprefix-1684998014 | 2023-05-25T07:14:42.000Z | name match      |                         | <<-- marked for deletion
| ami-02...6e | amiprefix-1684954911 | 2023-05-24T19:15:37.000Z | name match      |                         | <<-- marked for deletion
| ami-0e...da | amiprefix-1684952424 | 2023-05-24T18:32:06.000Z | name match      |                         | <<-- marked for deletion
| ami-0b...54 | amiprefix-1684949922 | 2023-05-24T17:50:26.000Z | name match      |                         | <<-- marked for deletion
| ami-0b...2c | amiprefix-1684937102 | 2023-05-24T14:17:53.000Z | name match      |                         | <<-- marked for deletion
| ami-0e...aa | amiprefix-1684915092 | 2023-05-24T08:09:42.000Z | name match      |                         | <<-- marked for deletion
+-------------+----------------------+--------------------------+-----------------+-------------------------+

Do you want to continue and remove 6 AMIs [y/N] ? : 
```

To delete all AMIs tagged with CostCenter=X342-*-1111, are older than 7 days (default), are not the newest 5 images (default), and are not in use (default), run:
```bash
aws-amicleaner --include-tag-key CostCenter --include-tag-value 'X342-*-1111'
```

Run the command without confirmation (useful in scripts):
```bash
aws-amicleaner --include-tag-key CostCenter --include-tag-value 'X342-*-1111' --force-delete
```

To disable the defaults, run:
```bash
aws-amicleaner --include-name 'amiprefix-*' --exclude-newest 0 --exclude-days 0 --no-exclude-in-use --no-verbose
```

## Arguments

```
-h, --help            show this help message and exit
--include-name INCLUDENAME
                      The name that must be present, wildcard * supported
--include-tag-key INCLUDETAGKEY
                      The tag key that must be present
--include-tag-value INCLUDETAGVALUE
                      The tag value (for the tag key) that must be present, wildcard * supported
--exclude-newest EXCLUDENEWEST
                      Exclude the newest N AMIs
--exclude-days EXCLUDEDAYS
                      Exclude AMIs from deletion that are younger than N days
--exclude-in-use, --no-exclude-in-use
                      Exclude AMIs from deletion that are in use by EC2 instances, ASGs, Launch Configurations, and Launch Templates (default: true)
-f, --force-delete, --no-force-delete
                      Skip confirmation before deletion (default: false)
--verbose, --no-verbose
                      Display additional information (default: true)
```
