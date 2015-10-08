#!/usr/bin/env node


var argv = require('optimist')
    .usage('\nUpdate AWS security groups with cloudfront IP\'s.\n\nUsage: $0 arg1..argn')
    .demand(1)
    .describe('arg1..argn', 'One or more security group ID\'s')
    .demand('r')
    .alias('r','region')
    .describe('r', 'The AWS Region (i.e. eu-west-1, etc)')
    .alias('k', 'accesskey')
    .describe('k', 'The AWS Access key; omit to retrieve from default AWS config')
    .alias('s', 'secret')
    .describe('s', 'The AWS Access key secret; omit to retrieve from default AWS config')
    .argv;



var Seq = require('seq');
var AWS = require('aws-sdk');

// Set your region for future requests, and further aws credentials
AWS.config.update({
    region: argv.region,
    accessKeyId: argv.accesskey,
    secretAccessKey: argv.secret
});
var EC2 = new AWS.EC2({apiVersion: '2015-10-01'});


Seq()
    .seq(function () {
        this.vars.cloudFrontIps = [];
        this.vars.securityGroupIds = argv._;
        this.vars.securityGroups = {};

        console.log('');
        console.log('Update AWS security groups %s with cloudfront IP\'s',  this.vars.securityGroupIds.join(','));
        console.log('');

        this();
    })
    // load cloudfront ips
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
                        _self.vars.cloudFrontIps.push(prefix.ip_prefix);
                    }
                }
                console.log('loaded AWS Cloudfront IPs:' + _self.vars.cloudFrontIps.join(', '));
                _self();
            } else {
                _self("Couldn't load AWS IPS");
            }
        })
    })
    // load security groups
    .par(function () {
        var _self = this;
        var params = {
            DryRun: false,
            GroupIds: _self.vars.securityGroupIds
        };
        EC2.describeSecurityGroups(params, function (err, data) {
            if (err) {
                _self(err);
            }
            for (var j in data.SecurityGroups) {
                var securityGroup = data.SecurityGroups[j];
                securityGroup.hasIngressPermission = function (protocol, ip, fromPort, toPort) {
                    for (var j in this.IpPermissions) {
                        var ipPermissions = this.IpPermissions[j];
                        if (ipPermissions.IpProtocol == protocol && ipPermissions.FromPort == fromPort && ipPermissions.ToPort == toPort) {
                            for (var k in ipPermissions.IpRanges) {
                                if (ipPermissions.IpRanges[k].CidrIp == ip) {
                                    return true;
                                }
                            }
                        }
                    }
                    return false;
                };
                _self.vars.securityGroups[securityGroup.GroupId] = securityGroup;
                console.log('loaded description of security group ' + securityGroup.GroupId);
            }
            _self();
        });
    })
    .seq(function () {
        console.log('');
        var _self = this;
        // @see: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#authorizeSecurityGroupIngress-property
        for (var i in _self.vars.securityGroupIds) {
            var rulesAdded = 0;
            var groupID =  _self.vars.securityGroupIds[i];
            var params = {
                DryRun: false,
                GroupId: groupID,
                IpPermissions: [
                ]
            };

            // add allowance for port 80
            var port80Permissions = {
                FromPort: 80,
                ToPort: 80,
                IpProtocol: 'TCP',
                IpRanges: []
            };

            for (var ipPrefix in _self.vars.cloudFrontIps) {
                if (_self.vars.securityGroups[groupID].hasIngressPermission('tcp', _self.vars.cloudFrontIps[ipPrefix], 80, 80)) {

                } else {
                    port80Permissions.IpRanges.push({
                        CidrIp: _self.vars.cloudFrontIps[ipPrefix]
                    });
                    rulesAdded++;
                }
            }
            if (port80Permissions.IpRanges.length > 0) {
                params.IpPermissions.push(port80Permissions);
            }

            // add allowances for port 443 (ssl)
            var port443Permissions = {
                FromPort: 443,
                ToPort: 443,
                IpProtocol: 'TCP',
                IpRanges: []
            };

            for (var ipPrefix in _self.vars.cloudFrontIps) {
                if (_self.vars.securityGroups[groupID].hasIngressPermission('tcp', _self.vars.cloudFrontIps[ipPrefix], 443, 443)) {

                } else {
                    port443Permissions.IpRanges.push({
                        CidrIp: _self.vars.cloudFrontIps[ipPrefix]
                    });
                    rulesAdded++;
                }
            }
            if (port443Permissions.IpRanges.length > 0) {
                params.IpPermissions.push(port443Permissions);
            }


            if (rulesAdded > 0) {
                console.log("Adding %d rules to security group %s", rulesAdded, groupID);
                EC2.authorizeSecurityGroupIngress(params, function (err, data) {
                    if (err) {
                        _self(err);
                        //console.log(err, err.stack);
                    } else {
                        _self();
                    }
                });
            } else {
                console.log('nothing to do for security group %s, all ip ranges present.', groupID);
            }

        }
        _self();
    }).seq(function () {
        console.log('');
        console.log('done');
    }).catch(function (err) {
        console.error(err.stack ? err.stack : err)
    });