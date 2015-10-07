#!/usr/bin/env node

var argv = require('optimist')
    .usage('Update AWS security groups with cloudfront IP\'s.\nUsage: $0 arg1..argn')
    .demand(1)

    .describe('arg1..argn', 'One or more security group ID\'s')
    .argv;

argv.securityGroups = argv._;

console.log('Update AWS security groups %s with cloudfront IP\'s', argv.securityGroups.join(',', argv.securityGroups));




