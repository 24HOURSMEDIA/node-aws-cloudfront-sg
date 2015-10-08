# AWS CloudFront security group updater
cloudfront-sg-njs

This script updates one or more security groups to allow access from Amazon's cloudfront IP ranges.

It is possible to link cloudfront to an ELB or directly to your EC2 instances, so one can make of signed URL's and use CloudFront's caching capabilities and edge locations.

However, this leaves a security hole as the EC2 or ELB has to have a public Ip/Dns. This allows clients to bypass cloudfront and directly execute requests against your EC2 instances.

Creating a CloudFront security group that allows only CloudFront reduces this risk since your ELB or EC2 can only be accessed through cloudfront.

## Basic usage

First, set up an empty security group, name is 'cloudfront80'. This security group will be filled with access rules to allow cloudfront access to port 80.

Then, make sure your AWS credentials has rights to modify and describe the security groups.

Execute the following command to update the security group with appropriate rules:

```
# run in dryrun mode for debugging or getting insight. no actual changes are performed.
node cloudfront-sg.js sg-xxxxxxxx --region=aws-region-x --port 80 --dryrun


# actually update the security group. default is interactive mode,
# confirmation questions
# will be asked
node cloudfront-sg.js sg-xxxxxxxx --region=aws-region-x --port 80 --update


# force update without any confirmation questions
# (for use with crontab activation
node cloudfront-sg.js sg-xxxxxxxx --region=aws-region-x --port 80 --update --force

# update multiple security groups
# (for use with crontab activation
node cloudfront-sg.js sg-xxxxxxxx sg-yyyyyyyy --region=aws-region-x --port 80

# update two security groups, one to allow port 80 http access,
# and one to allow port 443 https access
node cloudfront-sg.js sg-xxxxxxxx sg-xxxxxxxx --region=aws-region-x --port 80
node cloudfront-sg.js sg-xxxxxxxx sg-yyyyyyyy --region=aws-region-x --port 80

# update one security group with both port 80 and port 443 access
# (NOT RECOMMENDED - a security group can have only 50 rules)
node cloudfront-sg.js sg-xxxxxxxx --region=aws-region-x --port 80 --port 443

```

### passing custom credentials

If your default profile or IAM role does not allow making changes to the security group, you can use a custom access key and secret.
This is not recommended since the key and secret may be disclosed through the process list or command line history.

```
# use non-default access key and secret
node cloudfront-sg.js sg-xxxxxxxx --region=aws-region-x --accesskey=XXXXX  --secret=YYYYYY --port 80 --port 443
```


