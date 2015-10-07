#!/usr/bin/env node




var argv = require('optimist')
    .usage('Update AWS security groups with cloudfront IP\'s.\nUsage: $0 arg1..argn')
    .demand(1)

    .describe('arg1..argn', 'One or more security group ID\'s')
    .argv;

argv.securityGroupsIds = argv._;

var Seq = require('seq');
var AWS = require('aws-sdk');
// Set your region for future requests.
AWS.config.region = 'eu-west-1';



var cloudfrontIps = [];

Seq()
    .seq(function() {
        console.log('Update AWS security groups %s with cloudfront IP\'s', argv.securityGroupsIds.join(','));
        this();
    })
    .par(function () {
        var _self = this;
        var request = require("request");
        request('https://ip-ranges.amazonaws.com/ip-ranges.json', function (error, response, body) {
            if (!error && response.statusCode == 200) {
                //   console.log(body) // Show the HTML for the Google homepage.
                 var awsIps = JSON.parse(response.body);
                for (var prefixIndex in awsIps.prefixes) {
                    var prefix = awsIps.prefixes[prefixIndex];
                    if (prefix.service == 'CLOUDFRONT') {
                        cloudfrontIps.push(prefix.ip_prefix);
                    }
                }
                _self();
            } else {
                _self("Can't divide by zero");
            }
        })
    })
    .seq(function () {
        console.log('Loaded');

        // @see: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#authorizeSecurityGroupIngress-property
        var EC2 = new AWS.EC2({apiVersion: '2015-10-01'});

        for (var i in argv.securityGroupsIds) {
            var groupID = argv.securityGroupsIds[i];
            var params = {
                DryRun: false,
                GroupId: groupID,
                IpPermissions: [
                    /*
                    {
                        FromPort: 80,
                        ToPort: 80,
                        IpProtocol: 'TCP',
                        IpRanges: [
                            {
                                CidrIp: '10.0.0.1/24'
                            }
                        ]

                    }
                    */
                ]
            };

            // add allowance for port 80
            var port80Permissions = {
                FromPort: 80,
                ToPort: 80,
                IpProtocol: 'TCP',
                IpRanges: []
            };

            for (var ipPrefix in cloudfrontIps) {
                port80Permissions.IpRanges.push( {
                    CidrIp: cloudfrontIps[ipPrefix]
                })
            }
            params.IpPermissions.push(port80Permissions);

            // add allowances for port 443 (ssl)
            var port443Permissions = {
                FromPort: 443,
                ToPort: 443,
                IpProtocol: 'TCP',
                IpRanges: []
            };
            {}
            for (var ipPrefix in cloudfrontIps) {
                port443Permissions.IpRanges.push( {
                    CidrIp: cloudfrontIps[ipPrefix]
                })
            }
            params.IpPermissions.push(port443Permissions);

            EC2.authorizeSecurityGroupIngress(params, function (err, data) {
                if (err) console.log(err, err.stack); // an error occurred
                else     console.log(data);           // successful response
            });
        }



    }).catch(function (err) {
        console.error(err.stack ? err.stack : err)
    });






