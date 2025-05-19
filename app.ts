import express from "express";
import {zad5} from "./zad5/zad5.ts";

const app = express();
const port = 3003;
app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/chat requests`));

app.post("/api/chat", async (req, res) => {
    try {
        const result = await zad5(req);
        console.log(result);

        return res.json(result);
    } catch (err) {
        console.error(err); 
        return res.status(500).json({error: "Internal error"});
    }
});
