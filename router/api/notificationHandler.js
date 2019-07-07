const express = require('express');
const Employee = require('./../../models/employeeSchema');
const passport = require('passport');
const CONST = require('./../../config/const');
const Notification = require('./../../models/notificationSchema');
const User = require('./../../models/userSchema');
const Flat = require('./../../models/flatSchema');
const utils = require('./../../config/utils');
const logUtil = require('./../../lib/logUtil');
const EventUser = require('./../../models/eventUser');
const Rx = require('rxjs');
const Operators = require('rxjs/operators');
const _ = require('lodash');
const router = express.Router();
let flagCreateNotificationSuccessInitial = null;
let flagCreateNotificationSuccess = new Rx.BehaviorSubject(flagCreateNotificationSuccessInitial);
let flagCreateNotificationSuccess$ = flagCreateNotificationSuccess.asObservable();

async function pushNotification(notificationDto, employeeID, buildingID) {
    let listEventUseID = [];
    let listEventEmployeeID = [];
    let queryEmployee = await Employee.find({
        buildingID: buildingID,
        roles: { $in: [CONST.ROLES.ADMIN, CONST.ROLES.RCN] },
        status: { $in: [CONST.STATUS.ACTIVE, CONST.STATUS.WAIT_ACTIVE] }
    });
    queryEmployee.forEach(e => {
        listEventEmployeeID.push({
            id: e._id,
            type: 'EventEmployee'
        });
    })
    if (notificationDto.notifyScope.type == CONST.SCOPE_NOTIFICATION.ALL) {
        let query = await User.aggregate([
            {
                $match: { // filter only those posts in september
                    $and: [
                        { buildingID: buildingID },
                        { status: { $in: [1, 2] } },
                    ]
                },

            },
            {
                $lookup:
                {
                    from: "flats",
                    localField: "flatID",
                    foreignField: "_id",
                    as: "flat_info"
                },
            },
        ])

        query.forEach(e => {
            listEventUseID.push({
                id: e._id,
                userFlatID: e.flatID,
                type: 'EventUser'
            });
        })
    }
    if (notificationDto.notifyScope.type == CONST.SCOPE_NOTIFICATION.BUILDING) {
        let listBuilding = notificationDto.notifyScope.refs;
        logUtil.error(listBuilding);
        let query = await User.aggregate([
            {
                $match: { // filter only those posts in september
                    $and: [
                        { buildingID: buildingID },
                        { status: { $in: [1, 2] } },
                    ]
                },

            },
            {
                $lookup:
                {
                    from: "flats",
                    localField: "flatID",
                    foreignField: "_id",
                    as: "flat_info"
                },

            },
        ])
        query.forEach(e => {
            if (e.flat_info.length) {
                if (listBuilding.includes(e.flat_info[0].block)) {
                    listEventUseID.push({
                        id: e._id,
                        userFlatID: e.flatID,
                        type: 'EventUser'
                    });
                }
            }
        })

    }
    if (notificationDto.notifyScope.type == CONST.SCOPE_NOTIFICATION.FLAT) {
        let flatScope = notificationDto.notifyScope.refs;
        let flatList = await Flat.find({ _id: { $in: flatScope } });
        let listIDFlat = [];
        flatList.forEach(e => {
            listIDFlat.push(e._id);
        })
        let query = await User.find({
            buildingID: buildingID,
            status: { $in: [1, 2] },
            flatID: { $in: listIDFlat },
        })
        query.forEach(e => {
            listEventUseID.push({
                id: e._id,
                userFlatID: e.flatID,
                type: 'EventUser'
            });
        })
    }
    let listUserID = [...listEventUseID, ...listEventEmployeeID];
    let rxjsListUserID = Rx.from(listUserID);
    let countInsert = 0;
    rxjsListUserID.pipe(
        Operators.map(data => data),
        Operators.concatMap(async res => {
            let newItem = {
                title: notificationDto.title,
                content: notificationDto.content,
                buildingID,
                userID: res.id,
                type: res.type,
                userFlatID: res.userFlatID,
                parentNotificationID: notificationDto.id,
                createdBy: employeeID,
                dataType: CONST.DATA_TYPE.NOTIFICATION,
            }
            let newEvent = new EventUser(newItem);
            let save = newEvent.save();
            return Rx.of({ save })
        })
    ).subscribe(_ => {
        countInsert++;
        if (countInsert == listUserID.length) {
            flagCreateNotificationSuccess.next(true);
        }
    })
    logUtil.error(listUserID);

}

router.post('/create', passport.authenticate('jwt', { session: false }), async (req, res) => {
    const Auth = req.user;
    const employeeID = Auth.id;
    try {
        let employee = await Employee.findById(employeeID);
        if (!employee) {
            return res.status(400).json({
                status: 1,
                msg: 'Khong tim thay thong tin user'
            })
        }
        employee = employee.toJSON();
        let { title, content, priority, file, notifyScope, status } = req.body;
        let body = {
            title,
            content,
            priority,
            file,
            notifyScope,
            status,
            buildingID: employee.buildingID,
            created: Date.now,
            titleKhongDau: utils.locDau(title),
            createdBy: employeeID,
        }
        let newNotification = new Notification(body);

        newNotification.save()
            .then(async notification => {
                body.id = notification._id;
                await pushNotification(body, employeeID, employee.buildingID);
                return res.status(200).json({
                    msg: 'Tao thong bao thanh cong',
                    status: 0,
                    data: body,
                })
            })


    } catch (err) {
        return res.status(500).json({
            status: -1,
            msg: 'Co loi xay ra, vui long thu lai sau'
        })
    }
})


router.post('/getAllNofiticationForEmployee', passport.authenticate('jwt', { session: false }), async (req, res) => {
    const Auth = req.user;
    const employeeID = Auth.id;
    try {
        let employee = await Employee.findById(employeeID);

        if (!employee) {
            return res.status(400).json({
                status: 1,
                msg: 'Khong tim thay thong tin user'
            })
        }

        let getAllNotification = await Notification.aggregate([
            {
                $match: { // filter only those posts in september
                    $and: [
                        { buildingID: employee.buildingID, },

                    ]
                },

            },
            {
                $lookup: {
                    from: "eventusers",
                    localField: "_id",
                    foreignField: "parentNotificationID",
                    as: "events_docs",
                }
            },
            {
                $lookup: {
                    from: "flats",
                    as: "tb3",
                    localField: "events_docs.userID",
                    foreignField: "_id",
                }
            },
            {
                $sort: {
                    "timeCreated": -1
                }
            }
        ])
        for (let i = 0; i < getAllNotification.length; i++) {
            let flatDistinct = [];
            let listFlatAlreadyReadNotification = [];
            getAllNotification[i].events_docs.forEach(e => {
                e = JSON.stringify(e);
                e = JSON.parse(e);
                if (e.type == 'EventUser') {
                    let item = {
                        read: e.read,
                        flatId: e.userFlatID
                    }
                    listFlatAlreadyReadNotification.push(item);
                    flatDistinct.push(e.userFlatID);
                }
            })
            getAllNotification[i].flatDistinct = flatDistinct;
            getAllNotification[i].listFlatAlreadyReadNotification = listFlatAlreadyReadNotification;
        }
        for (let i = 0; i < getAllNotification.length; i++) {
            var uniqueFlat = getAllNotification[i].flatDistinct.filter((v, i, a) => a.indexOf(v) === i);
            let a = getAllNotification[i].listFlatAlreadyReadNotification;
            getAllNotification[i].flatDistinct = [...uniqueFlat];
            getAllNotification[i].listFlatAlreadyReadNotification = _.uniqWith(a, _.isEqual);
        }
        for (let i = 0; i < getAllNotification.length; i++) {
            let countRead = 0;
            getAllNotification[i].totalFlat = getAllNotification[i].flatDistinct.length;
            getAllNotification[i].listFlatAlreadyReadNotification.forEach(e => {
                if (e.read) {
                    countRead++;
                }
            })
            getAllNotification[i].totalRead = countRead;
            delete getAllNotification[i].flatDistinct;
            delete getAllNotification[i].listFlatAlreadyReadNotification;
            delete getAllNotification[i].events_docs;
        }
        return res.status(200).json({
            msg: 'ok',
            data: getAllNotification
        })
    } catch (Err) {
        return res.status(500).json({
            msg: 'Co loi xay ra',
            status: -1,
        })
    }

})

module.exports = router;