using System.Text.Json;
using LibreHardwareMonitor.Hardware;

if (args.Any(a => string.Equals(a, "--self-check", StringComparison.OrdinalIgnoreCase)))
{
    Console.WriteLine("NanoThermal self-check OK");
    return;
}

var response = new ThermalResponse
{
    Provider = "NanoThermal / LibreHardwareMonitor 0.9.6",
    Status = "NO_SUPPORTED_SENSORS",
    Message = "No se detectaron sensores térmicos compatibles.",
};

Computer? computer = null;
try
{
    computer = new Computer
    {
        IsCpuEnabled = true,
        IsGpuEnabled = true,
        IsMotherboardEnabled = true,
        IsControllerEnabled = true,
        IsMemoryEnabled = false,
        IsNetworkEnabled = false,
        IsStorageEnabled = false
    };

    computer.Open();
    var visitor = new UpdateVisitor();
    computer.Accept(visitor);
    Thread.Sleep(150);
    computer.Accept(visitor);

    foreach (var hardware in computer.Hardware)
    {
        CollectHardware(hardware, ClassifyHardware(hardware.HardwareType.ToString(), "OTHER"), response.Sensors);
    }

    response.Available = response.Sensors.Count > 0;
    response.Status = response.Available ? "READY" : "NO_SUPPORTED_SENSORS";
    response.Message = response.Available
        ? $"Se detectaron {response.Sensors.Count} sensores térmicos reales."
        : "El proveedor está operativo, pero este hardware no expone sensores térmicos compatibles.";
}
catch (Exception ex)
{
    response.Available = false;
    response.Status = "HELPER_ERROR";
    response.Message = ex.Message;
}
finally
{
    try { computer?.Close(); } catch { }
}

Console.WriteLine(JsonSerializer.Serialize(response, new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false
}));

static void CollectHardware(IHardware hardware, string inheritedKind, List<ThermalSensorRow> rows)
{
    var hardwareType = hardware.HardwareType.ToString();
    var kind = ClassifyHardware(hardwareType, inheritedKind);

    foreach (var sensor in hardware.Sensors)
    {
        if (sensor.SensorType != SensorType.Temperature || !sensor.Value.HasValue)
            continue;

        var value = (double)sensor.Value.Value;
        if (value <= 0 || value > 150)
            continue;

        rows.Add(new ThermalSensorRow
        {
            Kind = kind,
            HardwareName = hardware.Name ?? hardwareType,
            SensorName = sensor.Name ?? "Temperature",
            Identifier = sensor.Identifier.ToString(),
            TempC = Math.Round(value, 1),
            Source = "NanoThermal / LibreHardwareMonitor 0.9.6"
        });
    }

    foreach (var child in hardware.SubHardware)
    {
        CollectHardware(child, kind, rows);
    }
}

static string ClassifyHardware(string hardwareType, string inheritedKind)
{
    if (hardwareType.Equals("Cpu", StringComparison.OrdinalIgnoreCase))
        return "CPU";
    if (hardwareType.StartsWith("Gpu", StringComparison.OrdinalIgnoreCase))
        return "GPU";
    if (hardwareType.Equals("Motherboard", StringComparison.OrdinalIgnoreCase) ||
        hardwareType.Equals("SuperIO", StringComparison.OrdinalIgnoreCase))
        return "MOTHERBOARD";

    return inheritedKind is "CPU" or "GPU" or "MOTHERBOARD"
        ? inheritedKind
        : "OTHER";
}

sealed class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);

    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (var subHardware in hardware.SubHardware)
            subHardware.Accept(this);
    }

    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}

sealed class ThermalResponse
{
    public bool Available { get; set; }
    public string Provider { get; set; } = "";
    public string Status { get; set; } = "";
    public string Message { get; set; } = "";
    public List<ThermalSensorRow> Sensors { get; set; } = new();
}

sealed class ThermalSensorRow
{
    public string Kind { get; set; } = "";
    public string HardwareName { get; set; } = "";
    public string SensorName { get; set; } = "";
    public string Identifier { get; set; } = "";
    public double TempC { get; set; }
    public string Source { get; set; } = "";
}
