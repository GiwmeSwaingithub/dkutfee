module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const base = req.headers['x-forwarded-proto'] + '://' + req.headers['host'];

    const types = [
        { label: 'Certificate Fees',    type: 'CERTIFICATES' },
        { label: 'Diploma Fees',        type: 'DIPLOMA' },
        { label: 'Degree Fees',         type: 'DEGREE' },
        { label: 'Postgraduate Fees',   type: 'POSTGRADUATE' },
    ];

    return res.status(200).json({
        message: 'Append ?type=X to /api/fees to download that fee structure PDF',
        available: types.map(t => ({
            label      : t.label,
            downloadUrl: `${base}/api/fees?type=${t.type}`,
        })),
    });
};
