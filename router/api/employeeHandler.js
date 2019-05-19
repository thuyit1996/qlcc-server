const bcrypt = require('bcryptjs');
const express = require('express');
const Employee = require('./../../models/employeeSchema');
const jwt = require('jsonwebtoken');
const keys = require('./../../config/keys');
const passport = require('passport');
const CONST = require('./../../config/const');
const router = express.Router();

router.post('/create', passport.authenticate('jwt', { session: false }), (req, res, next) => {

    let Auth = req.user;
    let id = Auth.id;
    let { phone, password, email, birthDate, roles, note, avatar } = req.body;
    Employee.findById(id)
        .then(employee => {
            if (!employee) {
                return res.status(400).json({
                    status: 1,
                    msg: 'Khong tim thay nhan vien'
                })
            }
            employee = employee.toJSON();
            if (!employee.roles.includes("ADMIN") || !employee.roles.includes("ROOT")) {
                return res.status(400).json({
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
                status: CONST.STATUS.ACTIVE
            }
            Employee.find({ phone: phone })
                .then(exists => {
                    if (exists.length) {
                        return res.status(400).json({
                            status: 1,
                            msg: 'Nguoi dung nay da ton tai'
                        })
                    } else {
                        let newEmployee = new Employee(payload);
                        bcrypt.genSalt(10, (err, salt) => {
                            bcrypt.hash(newEmployee.password, salt, (err, hash) => {
                                if (err) throw err;
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
        }
            , err => {
                return res.status(500).json({
                    status: 1,
                    msg: 'Co loi he thong xay ra',
                    err: err
                })
            })
})

router.post('/login', async (req, res, next) => {
    let { phone, password } = req.body;
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

                let employee1 = employee.toJSON();
                bcrypt.compare(password, employee1.password).then(isMatch => {
                    console.log("SAO DEO VAO DAY", isMatch);
                    if (isMatch) {
                        const payload = {
                            id: employee1._id,
                            fullName: employee1.fullName,
                            phone: employee1.phone,
                            date: Date.now(),
                            email: employee1.email,
                        }
                        jwt.sign(
                            payload,
                            keys.secretOnKey,
                            {
                                expiresIn: (Math.floor(new Date().getTime() / 1000) + (7 * 24 * 60 * 60)) * 1000
                            },
                            (err, token) => {
                                res.status(200).json({
                                    status: 0,
                                    token: 'Bearer ' + token,
                                    data: employee1
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


module.exports = router;