  // Obter status color
  //    Aberto
  //    Pago
  //    Cancelado
  //    Vencido
  export function getStatusColorPagar(status: string): string{
    switch (status) {
      case 'Aberto':
        return '#535bf2';
      case 'Pago':
        return '#4CAF50';
      case 'Cancelado':
        return '#757575';
      case 'Vencido':
        return '#ff0000ff';
      case 'Pago em Atraso':
        return '#ffa600ff';        
      default:
        return '#757575';
    }
  };

  // Obter status color
  //    Pendente
  //    Recebido
  //    Cancelado
  //    Estornado
  export function getStatusColorReceber(status: string): string{
    switch (status) {
      case 'Recebido':
        return '#4CAF50';
      case 'Pago':
        return '#4CAF50';        
      case 'Pendente':
        return '#f3d421ff';
      case 'Cancelado':
        return '#F44336';
      case 'Em Aberto':
        return '#F44336';        
      case 'Estornado':
        return '#757575';
      default:
        return '#757575';
    }
  };  