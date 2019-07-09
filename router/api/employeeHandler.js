const bcrypt = require('bcryptjs');
const express = require('express');
const Employee = require('./../../models/employeeSchema');
const jwt = require('jsonwebtoken');
const keys = require('./../../config/keys');
const passport = require('passport');
const CONST = require('./../../config/const');
const Building = require('./../../models/buildingSchema');
const utils = require('./../../config/utils');
const logUtils = require('./../../lib/logUtil')
const router = express.Router();

router.post('/create', passport.authenticate('jwt', { session: false }), (req, res, next) => {

    let Auth = req.user;
    let id = Auth.id;
    let { phone, password, email, birthDate, roles, note, avatar, buildingID, fullName } = req.body;
    Employee.findById(id)
        .then(async employee => {
            if (!employee) {
                return res.status(200).json({
                    status: 1,
                    msg: 'Khong tim thay nhan vien'
                })
            }
            if (!(employee.roles.includes("ADMIN") || employee.roles.includes("ROOT"))) {
                console.log(employee.roles.includes("ROOT"));
                return res.status(200).json({
                    status: 1,
                    msg: 'Ban khong co quyen thuc hien thao tac nay'
                })
            }
            let payload = {
                phone,
                email,
                birthDate,
                roles,
                note,
                password,
                created: Date.now(),
                avatar: avatar,
                buildingID,
                fullName,
                userType: CONST.USER_TYPE.EMPLOYEE,
                fullNameKhongDau: utils.locDau(fullName),
                status: CONST.STATUS.ACTIVE
            }
            let building = await Building.findById(buildingID);
            if (building) {
                Employee.find({ phone: phone })
                    .then(exists => {
                        if (exists.length) {
                            return res.status(200).json({
                                status: 1,
                                msg: 'Nguoi dung nay da ton tai'
                            })
                        } else {
                            let newEmployee = new Employee(payload);
                            bcrypt.genSalt(10, (err, salt) => {
                                bcrypt.hash(newEmployee.password, salt, (err, hash) => {
                                    if (err) logUtils.error(err);
                                    newEmployee.password = hash;
                                    newEmployee
                                        .save()
                                        .then(employee => res.json({
                                            status: 0,
                                            msg: 'Them moi nhan vien thanh cong',
                                            data: employee
                                        }))
                                        .catch(err => console.log(err));
                                })
                            })
                        }
                    }, err => {
                        return res.status(500).json({
                            status: 1,
                            msg: 'Co loi he thong xay ra',
                            err: err
                        })
                    })
            } else {
                return res.status(200).json({
                    msg: 'Khong tim thay chung cu',
                    status: 1
                })
            }

        }, err => {
            return res.status(500).json({
                status: 1,
                msg: 'Co loi he thong xay ra',
                err: err
            })
        })
})

router.post('/login', async (req, res, next) => {
    let { phone, password } = req.body;
    console.log(phone, password);
    Employee.findOne({ phone: phone })
        .then(employee => {
            console.log("vao day");
            if (employee) {
                if (employee.status == 9) {
                    return res.status(400).json({
                        status: 1,
                        msg: 'Tai khoan cua ban da bi khoa, vui long lien he voi admin'
                    })
                }

                bcrypt.compare(password, employee.password).then(isMatch => {
                    console.log("SAO DEO VAO DAY", isMatch);
                    if (isMatch) {
                        const payload = {
                            id: employee._id,
                            fullName: employee.fullName,
                            phone: employee.phone,
                            date: Date.now(),
                            email: employee.email,
                            userType: employee.userType,

                        }
                        console.log(payload);
                        if (employee.buildingID) {
                            payload.buildingID = employee.buildingID;
                        }
                        jwt.sign(
                            payload,
                            keys.secretOnKey,
                            {
                                expiresIn: (Math.floor(new Date().getTime() / 1000) + (7 * 24 * 60 * 60)) * 1000
                            },
                            (err, token) => {
                                delete employee.password;
                                res.status(200).json({
                                    status: 0,
                                    token: 'Bearer ' + token,
                                    data: employee
                                })
                            }
                        )
                    } else {
                        return res.status(400).json({
                            status: 1,
                            msg: 'Mat khau khong chinh xac'
                        })
                    }
                }, err => {
                    return res.status(500).json({
                        status: -1,
                        msg: err
                    })
                })
            } else {
                return res.status(400).json({
                    status: 1,
                    msg: 'Khong tim thay thong tin nguoi dung'
                })
            }
        }, err => {
            return res.status(500).json({
                status: -1,
                msg: 'Co loi he thong'
            })
        })
})


router.post('/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
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
        return res.status(200).json({
            msg: 'Lay thong tin nhan vien thanh cong',
            data: employee,
            status: 0
        })
    } catch (err) {
        return res.status(500).json({
            status: -1,
            msg: 'Co loi xay ra, vui long thu lai sau'
        })
    }
})



router.post('/getAllEmployee', passport.authenticate('jwt', { session: false }), async (req, res) => {
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
        let conditionGet = {
            buildingID : employee.buildingID,
        }
        let employees = await Employee.aggregate([
            {
                $match: { 
                    $and: [
                        { buildingID: employee.buildingID },
                        { status: { $in: [1, 2] } },
                    ]
                },
            },
        ]);
        employees.forEach(e => {
            delete e.password
        })
        return res.status(200).json({
            msg : 'Lay danh sach nhan vien thanh cong',
            status : 0,
            data : employees

        })
    } catch (err) {
        return res.status(500).json({
            status: -1,
            msg: 'Co loi xay ra, vui long thu lai sau'
        })
    }
})
module.exports = router;