// One-off tool: writes api/test/fixtures/eval.json from the original C# BoardEvaluator, so the test
// suite can check that the tables and weights were copied correctly without needing .NET.
// BoardEvaluator is internal, so it is reached through reflection. The C# repo is not modified.
//
// Build against the compiled DLLs from C:\dev\cach\src\cacheEngineTests\bin\Debug, with csc:
//   csc -out:GenerateEval.exe -r:cachCore.dll -r:cacheEngine.dll -r:openingBook.dll -r:log4net.dll GenerateEval.cs
// then run it from a folder holding those DLLs, with the output path as its argument.
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using cachCore.enums;
using cachCore.models;
using cachCore.utils;

class GenerateEval
{
    static readonly string[] Fens =
    {
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w",
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b",
        "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w",
        "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w",
        "r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P4/2N1PN2/PPP1BPPP/R1BQK2R b",
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w",
        "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w",
        "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w",
        "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w",
        "4k3/8/8/8/8/8/4P3/4K3 w",
        "4k3/4p3/8/8/8/8/8/4K3 b",
        "8/P6k/8/8/8/8/8/K7 w",
        "k7/8/8/8/8/8/p6K/8 b",
        "4k3/8/8/8/8/8/8/R3K3 w",
        "r3k3/8/8/8/8/8/8/4K3 b",
        "4k3/8/8/3Q4/8/8/8/4K3 w",
        "4k3/8/8/3q4/8/8/8/4K3 b",
        "4k3/8/8/3B4/3b4/8/8/4K3 w",
        "4k3/8/8/3N4/3n4/8/8/4K3 w",
        "7k/8/8/8/8/8/8/K6R b",
        "3k4/8/8/8/8/8/8/3QK3 b",
        "3q3k/8/8/8/8/8/8/3K4 w",
        "6k1/5ppp/8/8/8/8/5PPP/R5K1 w",
        "r5k1/5ppp/8/8/8/8/5PPP/6K1 b",
        "2kr3r/ppp2ppp/2n1b3/2b1p3/4P3/2N2N2/PPP2PPP/R1B2RK1 w",
        "r2q1rk1/1pp2ppp/p1np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w",
        "8/8/4k3/8/2p5/8/1P2K3/8 w",
        "8/5pk1/6p1/8/8/1P6/P4K2/8 b",
    };

    static void Main(string[] args)
    {
        Type type = typeof(cacheEngine.Engine).Assembly.GetType("cacheEngine.BoardEvaluator");
        object evaluator = Activator.CreateInstance(type);
        MethodInfo evaluate = type.GetMethod("Evaluate");
        var rows = Fens.SelectMany(fen => new[] { ItemColor.White, ItemColor.Black }.Select(color =>
        {
            Board board = FENSerializer.BoardFromFEN(fen + " - -");
            int value = (int)evaluate.Invoke(evaluator, new object[] { board, color });
            return "  {\"fen\": \"" + fen + " - -\", \"color\": \"" + color.ToString().ToLower() + "\", \"value\": " + value + "}";
        }));
        File.WriteAllText(args[0], "[\n" + string.Join(",\n", rows) + "\n]\n");
    }
}
