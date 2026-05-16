"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
};
