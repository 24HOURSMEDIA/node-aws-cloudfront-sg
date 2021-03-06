#!/usr/bin/env node


var argv = require('optimist')
    .usage('\nUpdate AWS security groups with cloudfront IP\'s.\n\nUsage: $0 arg1..argn')
    .demand(1)
    .describe('arg1..argn', 'One or more security group ID\'s')
    .demand('r')
    .alias('r', 'region')
    .describe('r', 'The AWS Region (i.e. eu-west-1, etc)')
    .alias('k', 'accesskey')
    .describe('k', 'The AWS Access key; omit to retrieve from default AWS config')
    .alias('s', 'secret')
    .describe('s', 'The AWS Access key secret; omit to retrieve from default AWS config')
    .demand('p')
    .alias('p', 'port')
    .default('p', [80])
    .describe('p', 'The ports to open for Cloudfront')
    .boolean('u')
    .alias('u', 'update')
    .default('u', false)
    .describe('u', 'set flag to actually update the security groups')
    .boolean('force')
    .default('force', false)
    .describe('force', 'skip interactive and confirmation questions')
    .argv;

var Seq = require('seq');
var AWS = require('aws-sdk');
var RL = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});
RL.proceed = function(success,error) {
    this.question('Proceed?',function(answer) {
        console.log(answer);
        if (answer == 'Y' || answer == 'y' || answer == 'YES' || answer == 'yes') {
             success();
        } else {
            error();
        }
    });
};

if (argv.port.constructor !== Array) {
    argv.port = [argv.port];
}

// Set your region and further aws credentials for uture requests
AWS.config.update({
    region: argv.region,
    accessKeyId: argv.accesskey,
    secretAccessKey: argv.secret
});
var EC2 = new AWS.EC2({apiVersion: '2015-10-01', maxRetries: 2});

Seq()
    .seq(function () {
        var _self = this;
        this.vars.cloudFrontIps = [];
        this.vars.securityGroupIds = argv._;
        this.vars.securityGroups = [];
        this.vars.ports = argv.port;
        this.vars.dryrun = !argv.update;
        this.vars.hasError = false;
        this.vars.force = argv.force;

        console.log('');
        console.log('Update AWS security groups %s with cloudfront IP\'s for ports %s', this.vars.securityGroupIds.join(', '), this.vars.ports.join(', '));
        console.log(this.vars.dryrun ? 'Running in DRYRUN mode' : 'Running in UPDATE mode');
        console.log('');

        if (!this.vars.force) {
            RL.proceed(function() {
                _self();
            }, function() {
                _self('aborted');
            });
        } else {
            _self();
        }


    })
    // load cloudfront ips
    .seq(function () {
        var _self = this;
        var request = require("request");
        request('https://ip-ranges.amazonaws.com/ip-ranges.json', function (error, response, body) {
            if (!error && response.statusCode == 200) {
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
    .empty()
    .par(function () {
        var _self = this;
        var params = {
            DryRun: false,
            GroupIds: _self.vars.securityGroupIds
        };
        EC2.describeSecurityGroups(params, function (err, data) {
            if (err) {
                return _self(err);
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
                _self.vars.securityGroups.push(securityGroup);
                console.log('loaded description of security group ' + securityGroup.GroupId);
            }
            _self(null, _self.vars.securityGroups);
        });
    })
    .flatten()
    .seqFilter(function (securityGroup) {
        var _self = this;
        var rulesAdded = 0;
        var groupID = securityGroup.GroupId;
        console.log('\nupdating security group %s with %d ip ranges', groupID,_self.vars.cloudFrontIps.length);




        var params = {
            DryRun: this.vars.dryrun,
            GroupId: groupID,
            IpPermissions: []
        };
        // add allowances for each ports
        for (var pI in this.vars.ports) {
            var port = this.vars.ports[pI];
            console.log('adding %d rules for security group %s for port %d', _self.vars.cloudFrontIps.length,groupID, port);
            var permissions = {
                FromPort: port,
                ToPort: port,
                IpProtocol: 'TCP',
                IpRanges: []
            };
            for (var ipPrefix in _self.vars.cloudFrontIps) {
                if (securityGroup.hasIngressPermission('tcp', _self.vars.cloudFrontIps[ipPrefix], port, port)) {
                    // skip ingress permission
                } else {
                    permissions.IpRanges.push({
                        CidrIp: _self.vars.cloudFrontIps[ipPrefix]
                    });
                    console.log('adding rule to security group: ALLOW TCP for port %s to IP Range %s', port, _self.vars.cloudFrontIps[ipPrefix]);
                    rulesAdded++;
                }
            }
            if (permissions.IpRanges.length > 0) {
                params.IpPermissions.push(permissions);
            }
        }
        if (rulesAdded > 0) {
            console.log("Adding %d rules to security group %s", rulesAdded, groupID);

            var apply = function() {
                EC2.authorizeSecurityGroupIngress(params, function (err, data) {
                    if (err) {
                        if (err.code != 'DryRunOperation') {
                            console.error('Error: %s', err.message);
                            _self.vars.hasError = true;
                            _self();
                        } else {
                            // dryrun
                            console.log('skipped - dryrun mode; ' + err.message);
                            _self();
                        }
                    } else {
                        console.log('OK');
                        _self();
                    }
                });
            };


            if (!this.vars.force) {
                RL.proceed(function() {
                    apply();
                }, function() {
                    _self();
                });
            } else {
                apply();
            }

        } else {
            console.log('nothing to do for security group %s, all ip ranges present.', groupID);
            this();
        }
    }).seq(function () {
        if (this.vars.hasError) {
            this('An error occurred');
        } else {
            console.log('');
            console.log('done.');
            RL.close();
        }
    }).catch(function (err) {
        console.error(err.stack ? err.stack : err);
        RL.close();
    });

// end
